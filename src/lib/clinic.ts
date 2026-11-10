// Clinic-wide rules shared by every page. The database enforces the same hours
// (public.is_valid_clinic_slot), so keep the two in step.

export const CLINIC_NAME = "Teratai Family Clinic";
export const CLINIC_TZ = "Asia/Kuala_Lumpur";
export const CLINIC_UTC_OFFSET = "+08:00";
export const DEPOSIT_RM = 50;
export const SLOT_MINUTES = 30;
export const BOOKING_WINDOW_DAYS = 30;
export const MAX_REFERRAL_BYTES = 10 * 1024 * 1024;
export const REFERRAL_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];

/** Opening blocks per ISO weekday (1 = Monday ... 7 = Sunday), as [startHour, endHour). */
export const CLINIC_HOURS: Record<number, Array<[number, number]>> = {
  1: [
    [9, 13],
    [14, 17],
  ],
  2: [
    [9, 13],
    [14, 17],
  ],
  3: [
    [9, 13],
    [14, 17],
  ],
  4: [
    [9, 13],
    [14, 17],
  ],
  5: [
    [9, 13],
    [14, 17],
  ],
  6: [[9, 13]],
  7: [],
};

export const OPENING_HOURS_TEXT = [
  { days: "Monday – Friday", hours: "9:00 am – 1:00 pm, 2:00 pm – 5:00 pm" },
  { days: "Saturday", hours: "9:00 am – 1:00 pm" },
  { days: "Sunday & public holidays", hours: "Closed" },
];

const pad = (n: number) => String(n).padStart(2, "0");

/** ISO weekday (1-7) of a YYYY-MM-DD date string. */
export function isoWeekday(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return day === 0 ? 7 : day;
}

/** All bookable start times (ISO strings, UTC) on a clinic-local date. */
export function slotsForDate(dateStr: string): string[] {
  const blocks = CLINIC_HOURS[isoWeekday(dateStr)] ?? [];
  const out: string[] = [];
  for (const [start, end] of blocks) {
    for (let mins = start * 60; mins < end * 60; mins += SLOT_MINUTES) {
      const local = `${dateStr}T${pad(Math.floor(mins / 60))}:${pad(mins % 60)}:00${CLINIC_UTC_OFFSET}`;
      out.push(new Date(local).toISOString());
    }
  }
  return out;
}

export function isOpenOn(dateStr: string): boolean {
  return (CLINIC_HOURS[isoWeekday(dateStr)] ?? []).length > 0;
}

/** Today's date (YYYY-MM-DD) in clinic time. */
export function clinicDate(at: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CLINIC_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

export function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** UTC range covering one clinic-local day. */
export function dayRange(dateStr: string): { from: string; to: string } {
  return {
    from: new Date(`${dateStr}T00:00:00${CLINIC_UTC_OFFSET}`).toISOString(),
    to: new Date(`${addDays(dateStr, 1)}T00:00:00${CLINIC_UTC_OFFSET}`).toISOString(),
  };
}

/** Next `count` open clinic days starting today. */
export function upcomingOpenDays(count: number, from: Date = new Date()): string[] {
  const days: string[] = [];
  let d = clinicDate(from);
  let guard = 0;
  while (days.length < count && guard < count * 3) {
    if (isOpenOn(d)) days.push(d);
    d = addDays(d, 1);
    guard++;
  }
  return days;
}

/** Slots on a date that are still free and in the future. */
export function availableSlots(
  dateStr: string,
  taken: string[],
  now: Date = new Date(),
): string[] {
  const takenMs = new Set(taken.map((t) => new Date(t).getTime()));
  return slotsForDate(dateStr).filter((s) => {
    const ms = new Date(s).getTime();
    return ms > now.getTime() && !takenMs.has(ms);
  });
}

type ApptLike = { status: string; starts_at: string };

/** Patients may move or cancel only booked appointments that haven't started yet. */
export function canPatientChange(appt: ApptLike, now: Date = new Date()): boolean {
  return appt.status === "booked" && new Date(appt.starts_at).getTime() > now.getTime();
}

export function isUpcoming(appt: ApptLike, now: Date = new Date()): boolean {
  return appt.status === "booked" && new Date(appt.starts_at).getTime() > now.getTime();
}

export function formatDate(iso: string | Date, opts: Intl.DateTimeFormatOptions = {}): string {
  return new Intl.DateTimeFormat("en-MY", {
    timeZone: CLINIC_TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    ...opts,
  }).format(typeof iso === "string" ? new Date(iso) : iso);
}

export function formatTime(iso: string | Date): string {
  return new Intl.DateTimeFormat("en-MY", {
    timeZone: CLINIC_TZ,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .format(typeof iso === "string" ? new Date(iso) : iso)
    .toLowerCase();
}

/** Format a YYYY-MM-DD clinic date. */
export function formatDay(dateStr: string, opts: Intl.DateTimeFormatOptions = {}): string {
  return formatDate(new Date(`${dateStr}T12:00:00${CLINIC_UTC_OFFSET}`), opts);
}

export function friendlyError(err: unknown): string {
  const e = err as { code?: string; message?: string } | null;
  if (e?.code === "23505") return "Sorry, that time was just taken. Please choose another slot.";
  return e?.message || "Something went wrong. Please try again.";
}
