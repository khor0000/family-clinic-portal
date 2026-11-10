import { describe, expect, it } from "vitest";

import {
  DEPOSIT_RM,
  availableSlots,
  canPatientChange,
  formatTime,
  slotsForDate,
} from "./clinic";

// 2026-11-09 is a Monday, 2026-11-14 a Saturday, 2026-11-15 a Sunday.
describe("clinic rules", () => {
  it("charges a RM50 deposit", () => {
    expect(DEPOSIT_RM).toBe(50);
  });

  it("offers 30-minute weekday slots from 9am, skipping the 1pm lunch hour, last at 4:30pm", () => {
    const slots = slotsForDate("2026-11-09");
    expect(slots).toHaveLength(14);
    expect(formatTime(slots[0])).toBe("9:00 am");
    expect(slots.map(formatTime)).not.toContain("1:00 pm");
    expect(formatTime(slots.at(-1)!)).toBe("4:30 pm");
  });

  it("opens Saturday mornings only and is closed on Sunday", () => {
    const sat = slotsForDate("2026-11-14");
    expect(sat).toHaveLength(8);
    expect(formatTime(sat.at(-1)!)).toBe("12:30 pm");
    expect(slotsForDate("2026-11-15")).toEqual([]);
  });

  it("hides slots already taken or already passed", () => {
    const slots = slotsForDate("2026-11-09");
    const now = new Date(slots[2]); // 10:00 am
    const free = availableSlots("2026-11-09", [slots[4]], now);
    expect(free).not.toContain(slots[0]);
    expect(free).not.toContain(slots[2]);
    expect(free).not.toContain(slots[4]);
    expect(free).toContain(slots[3]);
  });

  it("lets patients change only booked appointments that have not started", () => {
    const now = new Date("2026-11-10T05:00:00Z");
    expect(canPatientChange({ status: "booked", starts_at: "2026-11-11T02:00:00Z" }, now)).toBe(true);
    expect(canPatientChange({ status: "booked", starts_at: "2026-11-09T02:00:00Z" }, now)).toBe(false);
    expect(canPatientChange({ status: "cancelled", starts_at: "2026-11-11T02:00:00Z" }, now)).toBe(false);
    expect(canPatientChange({ status: "completed", starts_at: "2026-11-11T02:00:00Z" }, now)).toBe(false);
  });
});
