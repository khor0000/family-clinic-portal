-- ===== Types =====
create type public.app_role as enum ('patient', 'doctor', 'admin');
create type public.appointment_status as enum ('booked', 'cancelled', 'completed');

-- ===== Profiles =====
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text,
  phone text,
  created_at timestamptz not null default now()
);
grant select, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

-- ===== Roles =====
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  unique (user_id, role)
);
grant select, insert, delete on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

-- ===== Doctors =====
create table public.doctors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique,
  email text,
  full_name text not null,
  specialty text not null default 'General Practice',
  bio text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
grant select (id, full_name, specialty, bio, active) on public.doctors to anon;
grant select, insert, update, delete on public.doctors to authenticated;
grant all on public.doctors to service_role;
alter table public.doctors enable row level security;

create policy "Visitors can view active doctors" on public.doctors
  for select to anon using (active);
create policy "Signed-in users can view doctors" on public.doctors
  for select to authenticated using (true);
create policy "Admins can add doctors" on public.doctors
  for insert to authenticated with check (public.has_role(auth.uid(), 'admin'));
create policy "Admins can update doctors" on public.doctors
  for update to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
create policy "Admins can delete doctors" on public.doctors
  for delete to authenticated using (public.has_role(auth.uid(), 'admin'));

-- ===== Appointments =====
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null,
  doctor_id uuid not null references public.doctors(id),
  starts_at timestamptz not null,
  reason text not null default '',
  status public.appointment_status not null default 'booked',
  deposit_paid boolean not null default false,
  deposit_paid_at timestamptz,
  referral_path text,
  referral_name text,
  visit_note text,
  note_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index appointments_no_double_booking on public.appointments (doctor_id, starts_at) where status <> 'cancelled';
create index appointments_patient_idx on public.appointments (patient_id, starts_at);
create index appointments_starts_idx on public.appointments (starts_at);
grant select, insert, update, delete on public.appointments to authenticated;
grant all on public.appointments to service_role;
alter table public.appointments enable row level security;

-- Helper: is the signed-in user the doctor account for this doctor row?
create or replace function public.is_doctor_account(_doctor_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.doctors where id = _doctor_id and user_id = auth.uid())
$$;

-- Helper: has this patient booked with the signed-in doctor?
create or replace function public.is_patient_of_doctor(_patient_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.appointments a
    join public.doctors d on d.id = a.doctor_id
    where a.patient_id = _patient_id and d.user_id = auth.uid()
  )
$$;

-- Helper: can the signed-in doctor open this referral file?
create or replace function public.can_doctor_view_referral(_path text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.appointments a
    join public.doctors d on d.id = a.doctor_id
    where a.referral_path = _path and d.user_id = auth.uid()
  )
$$;

create policy "View own, own-doctor or all (admin) appointments" on public.appointments
  for select to authenticated using (
    patient_id = auth.uid() or public.has_role(auth.uid(), 'admin') or public.is_doctor_account(doctor_id)
  );
create policy "Patients book for themselves; admins for anyone" on public.appointments
  for insert to authenticated with check (
    patient_id = auth.uid() or public.has_role(auth.uid(), 'admin')
  );
create policy "Update own, own-doctor or all (admin) appointments" on public.appointments
  for update to authenticated using (
    patient_id = auth.uid() or public.has_role(auth.uid(), 'admin') or public.is_doctor_account(doctor_id)
  ) with check (
    patient_id = auth.uid() or public.has_role(auth.uid(), 'admin') or public.is_doctor_account(doctor_id)
  );
create policy "Admins can delete appointments" on public.appointments
  for delete to authenticated using (public.has_role(auth.uid(), 'admin'));

-- Profiles policies
create policy "Users view own profile" on public.profiles
  for select to authenticated using (id = auth.uid());
create policy "Admins view all profiles" on public.profiles
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "Doctors view their patients" on public.profiles
  for select to authenticated using (public.is_patient_of_doctor(id));
create policy "Users update own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Roles policies
create policy "Users view own roles" on public.user_roles
  for select to authenticated using (user_id = auth.uid());
create policy "Admins view all roles" on public.user_roles
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "Admins grant roles" on public.user_roles
  for insert to authenticated with check (public.has_role(auth.uid(), 'admin'));
create policy "Admins remove roles" on public.user_roles
  for delete to authenticated using (public.has_role(auth.uid(), 'admin'));

-- ===== Clinic hours (Malaysia time): Mon-Fri 09:00-13:00 & 14:00-17:00, Sat 09:00-13:00, 30-min slots =====
create or replace function public.is_valid_clinic_slot(_ts timestamptz)
returns boolean language plpgsql immutable set search_path = public as $$
declare
  l timestamp := _ts at time zone 'Asia/Kuala_Lumpur';
  dow int := extract(isodow from l);
  h int := extract(hour from l);
  m int := extract(minute from l);
  s numeric := extract(second from l);
begin
  if s <> 0 or m not in (0, 30) then return false; end if;
  if dow = 7 then return false; end if;
  if dow = 6 then return h >= 9 and h < 13; end if;
  return h >= 9 and h < 17 and h <> 13;
end $$;

-- Slots already taken for a doctor (no patient details exposed)
create or replace function public.get_taken_slots(_doctor_id uuid, _from timestamptz, _to timestamptz)
returns table (starts_at timestamptz) language sql stable security definer set search_path = public as $$
  select a.starts_at from public.appointments a
  where a.doctor_id = _doctor_id and a.status <> 'cancelled'
    and a.starts_at >= _from and a.starts_at < _to
$$;
revoke execute on function public.get_taken_slots(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.get_taken_slots(uuid, timestamptz, timestamptz) to authenticated;

-- Guard what each role may change on an appointment
create or replace function public.appointments_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  is_admin boolean;
  is_doc boolean;
begin
  new.updated_at := now();
  if uid is null then return new; end if; -- trusted server/migration context
  is_admin := public.has_role(uid, 'admin');
  if is_admin then
    if tg_op = 'UPDATE' and new.deposit_paid and not old.deposit_paid then new.deposit_paid_at := now(); end if;
    if tg_op = 'UPDATE' and not new.deposit_paid then new.deposit_paid_at := null; end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.status := 'booked';
    new.deposit_paid := false;
    new.deposit_paid_at := null;
    new.visit_note := null;
    new.note_updated_at := null;
    if new.starts_at <= now() then raise exception 'Please choose a time in the future.'; end if;
    if not public.is_valid_clinic_slot(new.starts_at) then raise exception 'That time is outside clinic hours.'; end if;
    if not exists (select 1 from public.doctors where id = new.doctor_id and active) then
      raise exception 'This doctor is not taking bookings.';
    end if;
    if new.referral_path is not null and split_part(new.referral_path, '/', 1) <> uid::text then
      raise exception 'Invalid referral file.';
    end if;
    return new;
  end if;

  is_doc := exists (select 1 from public.doctors where id = old.doctor_id and user_id = uid);
  if is_doc and old.patient_id <> uid then
    if new.patient_id <> old.patient_id or new.doctor_id <> old.doctor_id or new.starts_at <> old.starts_at
       or new.deposit_paid <> old.deposit_paid or new.referral_path is distinct from old.referral_path
       or new.reason <> old.reason then
      raise exception 'Doctors can only update the visit note and visit status.';
    end if;
    if new.visit_note is distinct from old.visit_note then new.note_updated_at := now(); end if;
    return new;
  end if;

  -- Patient
  if new.patient_id <> old.patient_id or new.doctor_id <> old.doctor_id
     or new.deposit_paid <> old.deposit_paid or new.deposit_paid_at is distinct from old.deposit_paid_at
     or new.visit_note is distinct from old.visit_note or new.note_updated_at is distinct from old.note_updated_at
     or new.referral_path is distinct from old.referral_path then
    raise exception 'You can only move or cancel this appointment.';
  end if;
  if old.status <> 'booked' then raise exception 'This appointment can no longer be changed.'; end if;
  if old.starts_at <= now() then raise exception 'Past appointments cannot be changed.'; end if;
  if new.status not in ('booked', 'cancelled') then raise exception 'Invalid status.'; end if;
  if new.starts_at <> old.starts_at then
    if new.status <> 'booked' then raise exception 'Invalid change.'; end if;
    if new.starts_at <= now() then raise exception 'Please choose a time in the future.'; end if;
    if not public.is_valid_clinic_slot(new.starts_at) then raise exception 'That time is outside clinic hours.'; end if;
  end if;
  return new;
end $$;

create trigger appointments_guard_trg
  before insert or update on public.appointments
  for each row execute function public.appointments_guard();

-- ===== Account linking =====
-- Give a confirmed user the doctor role when their email matches a doctor row
create or replace function public.link_doctor_account(_user_id uuid, _email text)
returns void language plpgsql security definer set search_path = public as $$
declare doc_id uuid;
begin
  if _email is null then return; end if;
  select id into doc_id from public.doctors
    where lower(email) = lower(_email) and user_id is null limit 1;
  if doc_id is null then return; end if;
  update public.doctors set user_id = _user_id where id = doc_id;
  insert into public.user_roles (user_id, role) values (_user_id, 'doctor') on conflict do nothing;
  delete from public.user_roles where user_id = _user_id and role = 'patient';
end $$;
revoke execute on function public.link_doctor_account(uuid, text) from public, anon, authenticated;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email, phone)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), nullif(new.raw_user_meta_data->>'name', ''), split_part(new.email, '@', 1)),
    new.email,
    nullif(new.raw_user_meta_data->>'phone', '')
  );
  insert into public.user_roles (user_id, role) values (new.id, 'patient') on conflict do nothing;
  if new.email_confirmed_at is not null then
    perform public.link_doctor_account(new.id, new.email);
  end if;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.handle_user_confirmed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    perform public.link_doctor_account(new.id, new.email);
  end if;
  return new;
end $$;

create trigger on_auth_user_confirmed
  after update of email_confirmed_at on auth.users
  for each row execute function public.handle_user_confirmed();

-- When the receptionist adds a doctor with the email of an existing confirmed account, link it
create or replace function public.doctors_link_existing()
returns trigger language plpgsql security definer set search_path = public, auth as $$
declare uid uuid;
begin
  if new.user_id is null and new.email is not null then
    select u.id into uid from auth.users u
      where lower(u.email) = lower(new.email) and u.email_confirmed_at is not null limit 1;
    if uid is not null and not exists (select 1 from public.doctors where user_id = uid) then
      new.user_id := uid;
      insert into public.user_roles (user_id, role) values (uid, 'doctor') on conflict do nothing;
      delete from public.user_roles where user_id = uid and role = 'patient';
    end if;
  end if;
  return new;
end $$;

create trigger doctors_link_existing_trg
  before insert or update of email on public.doctors
  for each row execute function public.doctors_link_existing();

-- ===== Referral file access (private "referrals" bucket, files stored under <patient id>/...) =====
create policy "Patients upload own referrals" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'referrals' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Patients, their doctor and admins read referrals" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'referrals' and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.has_role(auth.uid(), 'admin')
      or public.can_doctor_view_referral(name)
    )
  );
create policy "Patients delete own referrals" on storage.objects
  for delete to authenticated
  using (bucket_id = 'referrals' and (storage.foldername(name))[1] = auth.uid()::text);

-- ===== Sample data =====
insert into public.doctors (id, email, full_name, specialty, bio) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'doctor_1@test.local', 'Dr. Aisyah Rahman', 'Family Medicine', 'Looks after families of all ages, from check-ups to long-term care.'),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'doctor_2@test.local', 'Dr. Daniel Lim', 'General Practice', 'Everyday illnesses, health screening and travel advice.'),
  ('aaaaaaaa-0000-4000-8000-000000000003', null, 'Dr. Priya Nair', 'Child Health', 'Gentle care for babies, children and teenagers.');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
)
select '00000000-0000-0000-0000-000000000000', v.id, 'authenticated', 'authenticated', v.email,
  extensions.crypt('Clinic123!', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', v.full_name, 'phone', v.phone), now(), now(),
  '', '', '', '', '', '', '', ''
from (values
  ('11111111-1111-4111-8111-111111111111'::uuid, 'user_a@test.local', 'Ahmad bin Ismail', '012-345 6789'),
  ('22222222-2222-4222-8222-222222222222'::uuid, 'user_b@test.local', 'Mei Ling Tan', '013-987 6543'),
  ('33333333-3333-4333-8333-333333333333'::uuid, 'doctor_1@test.local', 'Dr. Aisyah Rahman', null),
  ('44444444-4444-4444-8444-444444444444'::uuid, 'doctor_2@test.local', 'Dr. Daniel Lim', null),
  ('55555555-5555-4555-8555-555555555555'::uuid, 'admin@test.local', 'Reception', null)
) as v(id, email, full_name, phone);

insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select u.id::text, u.id, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), 'email', now(), now(), now()
from auth.users u
where u.email in ('user_a@test.local', 'user_b@test.local', 'doctor_1@test.local', 'doctor_2@test.local', 'admin@test.local');

insert into public.user_roles (user_id, role) values ('55555555-5555-4555-8555-555555555555', 'admin') on conflict do nothing;
delete from public.user_roles where user_id = '55555555-5555-4555-8555-555555555555' and role = 'patient';

insert into public.appointments (patient_id, doctor_id, starts_at, reason, status, deposit_paid, deposit_paid_at, referral_path, referral_name, visit_note, note_updated_at) values
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000001',
   (date_trunc('day', now() at time zone 'Asia/Kuala_Lumpur') - interval '7 days' + interval '10 hours') at time zone 'Asia/Kuala_Lumpur',
   'Persistent cough for two weeks', 'completed', true,
   (date_trunc('day', now() at time zone 'Asia/Kuala_Lumpur') - interval '7 days' + interval '10 hours') at time zone 'Asia/Kuala_Lumpur',
   null, null,
   'Mild chest infection, lungs otherwise clear. Prescribed a 5-day course of antibiotics and cough syrup. Rest, drink plenty of water. Come back if fever develops or the cough lasts beyond another week.',
   (date_trunc('day', now() at time zone 'Asia/Kuala_Lumpur') - interval '7 days' + interval '11 hours') at time zone 'Asia/Kuala_Lumpur'),
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000001',
   (date_trunc('day', now() at time zone 'Asia/Kuala_Lumpur') + interval '3 days' + interval '10 hours 30 minutes') at time zone 'Asia/Kuala_Lumpur',
   'Follow-up and review of specialist referral', 'booked', false, null,
   '11111111-1111-4111-8111-111111111111/sample-referral-letter.pdf', 'Referral letter.pdf', null, null),
  ('22222222-2222-4222-8222-222222222222', 'aaaaaaaa-0000-4000-8000-000000000002',
   (date_trunc('day', now() at time zone 'Asia/Kuala_Lumpur') + interval '2 days' + interval '11 hours') at time zone 'Asia/Kuala_Lumpur',
   'Annual health screening', 'booked', false, null, null, null, null, null);
