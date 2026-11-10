import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  BOOKING_WINDOW_DAYS,
  availableSlots,
  clinicDate,
  formatDay,
  formatTime,
  slotsForDate,
  upcomingOpenDays,
} from "@/lib/clinic";
import { takenSlotsQuery } from "@/lib/queries";

type Props = {
  doctorId: string;
  value: string | null;
  onChange: (iso: string | null) => void;
  /** The appointment's current time when moving it; shown as "current". */
  currentStart?: string;
};

export function SlotPicker({ doctorId, value, onChange, currentStart }: Props) {
  const days = useMemo(() => upcomingOpenDays(BOOKING_WINDOW_DAYS), []);
  const [date, setDate] = useState<string>(() =>
    value ? clinicDate(new Date(value)) : (days[0] ?? clinicDate()),
  );
  const { data: taken, isLoading } = useQuery(takenSlotsQuery(doctorId, date));

  const all = slotsForDate(date);
  const free = new Set(availableSlots(date, taken ?? []));
  const currentMs = currentStart ? new Date(currentStart).getTime() : null;

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-sm font-medium">Choose a day</p>
        <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-2">
          {days.map((d) => {
            const selected = d === date;
            return (
              <button
                key={d}
                type="button"
                onClick={() => {
                  setDate(d);
                  onChange(null);
                }}
                className={cn(
                  "flex min-w-[4.25rem] snap-start flex-col items-center rounded-xl border px-3 py-2 text-center transition-colors",
                  selected
                    ? "border-primary bg-primary text-primary-foreground shadow-soft"
                    : "border-border bg-card hover:border-primary/50",
                )}
              >
                <span className="text-xs opacity-80">{formatDay(d, { weekday: "short", day: undefined, month: undefined, year: undefined })}</span>
                <span className="text-lg font-semibold leading-tight">
                  {formatDay(d, { weekday: undefined, day: "numeric", month: undefined, year: undefined })}
                </span>
                <span className="text-xs opacity-80">
                  {formatDay(d, { weekday: undefined, day: undefined, month: "short", year: undefined })}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">
          Times on {formatDay(date, { year: undefined, month: "long" })}
        </p>
        {isLoading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Checking availability…
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
            {all.map((slot) => {
              const ms = new Date(slot).getTime();
              const isCurrent = currentMs === ms;
              const isFree = free.has(slot);
              const selected = value === slot;
              return (
                <button
                  key={slot}
                  type="button"
                  disabled={!isFree}
                  onClick={() => onChange(slot)}
                  className={cn(
                    "rounded-lg border px-2 py-2.5 text-sm font-medium transition-colors",
                    selected && "border-primary bg-primary text-primary-foreground",
                    !selected && isFree && "border-border bg-card hover:border-primary hover:bg-accent",
                    !isFree && "cursor-not-allowed border-dashed border-border bg-muted text-muted-foreground line-through decoration-muted-foreground/40",
                    isCurrent && !selected && "no-underline",
                  )}
                >
                  {formatTime(slot)}
                  {isCurrent && <span className="block text-[10px] font-normal no-underline">current</span>}
                </button>
              );
            })}
          </div>
        )}
        {!isLoading && free.size === 0 && (
          <p className="mt-3 text-sm text-muted-foreground">No free times on this day — try another.</p>
        )}
      </div>
    </div>
  );
}
