import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { dayRange } from "@/lib/clinic";

export type Doctor = Tables<"doctors">;
export type Appointment = Tables<"appointments">;
export type PatientInfo = Pick<Tables<"profiles">, "id" | "full_name" | "phone" | "email">;
export type DoctorSummary = Pick<Doctor, "id" | "full_name" | "specialty">;
export type AppointmentWithDoctor = Appointment & { doctor: DoctorSummary | null };
export type AppointmentFull = AppointmentWithDoctor & { patient: PatientInfo | null };

const APPT_SELECT = "*, doctor:doctors(id, full_name, specialty)";

export const publicDoctorsQuery = () =>
  queryOptions({
    queryKey: ["doctors", "public"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("doctors")
        .select("id, full_name, specialty, bio")
        .eq("active", true)
        .order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });

export const allDoctorsQuery = () =>
  queryOptions({
    queryKey: ["doctors", "all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("doctors").select("*").order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });

export const myAppointmentsQuery = (userId: string) =>
  queryOptions({
    queryKey: ["appointments", "mine", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select(APPT_SELECT)
        .eq("patient_id", userId)
        .order("starts_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as AppointmentWithDoctor[];
    },
  });

export const doctorForUserQuery = (userId: string) =>
  queryOptions({
    queryKey: ["doctors", "for-user", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("doctors")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

async function attachPatients(rows: AppointmentWithDoctor[]): Promise<AppointmentFull[]> {
  const ids = [...new Set(rows.map((r) => r.patient_id))];
  if (!ids.length) return [];
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, phone, email")
    .in("id", ids);
  if (error) throw error;
  const map = new Map((data ?? []).map((p) => [p.id, p]));
  return rows.map((r) => ({ ...r, patient: map.get(r.patient_id) ?? null }));
}

export const doctorDayQuery = (doctorId: string, date: string) =>
  queryOptions({
    queryKey: ["appointments", "doctor", doctorId, date],
    queryFn: async () => {
      const { from, to } = dayRange(date);
      const { data, error } = await supabase
        .from("appointments")
        .select(APPT_SELECT)
        .eq("doctor_id", doctorId)
        .gte("starts_at", from)
        .lt("starts_at", to)
        .order("starts_at");
      if (error) throw error;
      return attachPatients((data ?? []) as AppointmentWithDoctor[]);
    },
  });

export type BookingsFilter = { mode: "day"; date: string } | { mode: "upcoming" };

export const adminBookingsQuery = (filter: BookingsFilter) =>
  queryOptions({
    queryKey: ["appointments", "admin", filter],
    queryFn: async () => {
      let q = supabase.from("appointments").select(APPT_SELECT).order("starts_at");
      if (filter.mode === "day") {
        const { from, to } = dayRange(filter.date);
        q = q.gte("starts_at", from).lt("starts_at", to);
      } else {
        q = q.gte("starts_at", new Date().toISOString()).neq("status", "cancelled").limit(500);
      }
      const { data, error } = await q;
      if (error) throw error;
      return attachPatients((data ?? []) as AppointmentWithDoctor[]);
    },
  });

export const takenSlotsQuery = (doctorId: string, date: string) =>
  queryOptions({
    queryKey: ["taken-slots", doctorId, date],
    queryFn: async () => {
      const { from, to } = dayRange(date);
      const { data, error } = await supabase.rpc("get_taken_slots", {
        _doctor_id: doctorId,
        _from: from,
        _to: to,
      });
      if (error) throw error;
      return (data ?? []).map((r) => r.starts_at);
    },
    staleTime: 0,
  });
