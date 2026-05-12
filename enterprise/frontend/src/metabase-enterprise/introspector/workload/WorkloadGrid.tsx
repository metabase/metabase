/* eslint-disable metabase/no-color-literals */
import { Fragment, useMemo } from "react";
import { t } from "ttag";

import { Box, Flex, Group, Skeleton, Text } from "metabase/ui";

import type { WorkloadCell } from "./types";

type Props = {
  cells: WorkloadCell[];
  scaleMax: number;
  isLoading: boolean;
  focusedSlot: string | null;
  onSelectSlot: (slot: string) => void;
  timezone: string;
};

const COLORS = [
  "#f3f4f6",
  "#dbeafe",
  "#93c5fd",
  "#3b82f6",
  "#1d4ed8",
  "#1e3a8a",
];

const ROW_HEIGHT_PX = 28;

// Business hours shading: Mon-Fri 9am-5pm in instance timezone. Picked as a
// universal default — most "relax to avoid loads" concern is "don't run heavy
// jobs while people are working." A future setting could make this configurable.
const BUSINESS_HOUR_START = 9;
const BUSINESS_HOUR_END = 17;
const BUSINESS_DAY_TINT = "rgba(245, 158, 11, 0.06)"; // soft amber wash

// Peak-relative thresholds: each bucket boundary is a fraction of this view's
// busiest hour. Stable as filters change (top bucket is always "near the peak"
// rather than "wherever the cells cluster") and skewed toward the upper end so
// hotspots stand out instead of being averaged into the middle of the scale.
const BUCKET_FRACTIONS = [0.15, 0.35, 0.6, 0.85];

function computeThresholds(scaleMax: number): number[] {
  if (scaleMax <= 0) {
    return [];
  }
  return BUCKET_FRACTIONS.map((f) => scaleMax * f);
}

function bucketIndex(value: number, thresholds: number[]): number {
  if (value <= 0) {
    return 0;
  }
  let i = 0;
  while (i < thresholds.length && value > thresholds[i]) {
    i++;
  }
  return Math.min(5, i + 1);
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function daysInRange(cells: WorkloadCell[]): string[] {
  const set = new Set(cells.map((c) => c.day));
  const arr = [...set];
  arr.sort();
  return arr;
}

// `Intl.DateTimeFormat` construction is the hot cost here — build once per
// timezone and reuse across all 168 cells + 7 day labels.
type TzFormatters = {
  bizHour: Intl.DateTimeFormat;
  dayLabel: Intl.DateTimeFormat;
  isoDay: Intl.DateTimeFormat;
};

function makeFormatters(timezone: string): TzFormatters {
  return {
    bizHour: new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
      hour: "numeric",
      hour12: false,
    }),
    dayLabel: new Intl.DateTimeFormat(undefined, {
      timeZone: timezone,
      weekday: "short",
      month: "numeric",
      day: "numeric",
    }),
    isoDay: new Intl.DateTimeFormat("en-CA", { timeZone: timezone }),
  };
}

function isBusinessHour(fmt: TzFormatters, day: string, hour: number): boolean {
  const [y, m, d] = day.split("-").map(Number);
  const instant = new Date(Date.UTC(y, m - 1, d, hour));
  const parts = fmt.bizHour.formatToParts(instant);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hourStr = parts.find((p) => p.type === "hour")?.value ?? "0";
  const localHour = parseInt(hourStr, 10);
  const isWeekday = !["Sat", "Sun"].includes(weekday);
  return (
    isWeekday &&
    localHour >= BUSINESS_HOUR_START &&
    localHour < BUSINESS_HOUR_END
  );
}

function formatDayLabel(
  fmt: TzFormatters,
  day: string,
  todayIso: string,
): { label: string; isToday: boolean } {
  const [y, m, d] = day.split("-").map(Number);
  // Anchor at noon UTC so the date doesn't flip when projecting to most TZs.
  const noon = new Date(Date.UTC(y, m - 1, d, 12));
  const label = fmt.dayLabel.format(noon).replace(",", "");
  return { label, isToday: fmt.isoDay.format(noon) === todayIso };
}

export function WorkloadGrid({
  cells,
  scaleMax,
  isLoading,
  focusedSlot,
  onSelectSlot,
  timezone,
}: Props) {
  const days = useMemo(() => daysInRange(cells), [cells]);
  const byKey = useMemo(() => {
    const m = new Map<string, WorkloadCell>();
    for (const c of cells) {
      const minute = typeof c.minute === "number" ? c.minute : 0;
      m.set(`${c.day}T${pad2(c.hour)}:${pad2(minute)}`, c);
    }
    return m;
  }, [cells]);

  const thresholds = useMemo(() => computeThresholds(scaleMax), [scaleMax]);
  const fmt = useMemo(() => makeFormatters(timezone), [timezone]);
  const todayIso = useMemo(() => fmt.isoDay.format(new Date()), [fmt]);

  if (isLoading) {
    return (
      <Flex direction="column" gap={6}>
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} height={28} />
        ))}
      </Flex>
    );
  }

  return (
    <Box>
      <Box
        style={{
          display: "grid",
          gridTemplateColumns: "80px repeat(24, 1fr)",
          gap: 2,
          marginBottom: 4,
        }}
      >
        <Text size="xs" c="text-secondary" fw={500}>
          {t`Hour (${timezone})`}
        </Text>
        {Array.from({ length: 24 }).map((_, h) => (
          <Text key={h} size="xs" c="text-secondary" ta="center">
            {pad2(h)}
          </Text>
        ))}
      </Box>

      <Box
        style={{
          display: "grid",
          gridTemplateColumns: "80px repeat(24, 1fr)",
          gap: 2,
          alignItems: "stretch",
        }}
      >
        {days.map((day) => {
          const { label, isToday } = formatDayLabel(fmt, day, todayIso);
          return (
            <Fragment key={day}>
              <Text
                size="xs"
                c={isToday ? "text-primary" : "text-secondary"}
                fw={isToday ? 700 : 400}
                style={{
                  alignSelf: "center",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {label}
              </Text>
              {Array.from({ length: 24 }).map((_, h) => {
                const slot = `${day}T${pad2(h)}:00`;
                const cell = byKey.get(slot);
                const value = cell?.weight ?? 0;
                const idx = bucketIndex(value, thresholds);
                const focused = focusedSlot === slot;
                const isBiz = isBusinessHour(fmt, day, h);
                const noun = value === 1 ? t`job` : t`jobs`;
                return (
                  <Box
                    key={slot}
                    role="button"
                    tabIndex={0}
                    aria-label={t`${label} ${pad2(h)}:00, ${value} ${noun}`}
                    aria-pressed={focused}
                    onClick={() => onSelectSlot(slot)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelectSlot(slot);
                      }
                    }}
                    title={`${label} ${pad2(h)}:00 ${timezone} — ${value} ${noun}`}
                    style={{
                      height: ROW_HEIGHT_PX,
                      background: COLORS[idx],
                      backgroundImage: isBiz
                        ? `linear-gradient(${BUSINESS_DAY_TINT}, ${BUSINESS_DAY_TINT})`
                        : undefined,
                      borderRadius: 3,
                      outline: focused
                        ? "2.5px solid var(--mb-color-brand)"
                        : undefined,
                      outlineOffset: focused ? 1 : 0,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      color: idx >= 3 ? "rgba(255,255,255,0.9)" : "#1e3a8a",
                    }}
                  >
                    {value > 0 ? value : ""}
                  </Box>
                );
              })}
            </Fragment>
          );
        })}
      </Box>

      <Group mt="sm" gap={16} align="center">
        <Flex gap={4} align="center">
          <Text size="xs" c="text-secondary" mr={4}>
            {t`Light`}
          </Text>
          {COLORS.map((c) => (
            <Box
              key={c}
              style={{
                width: 18,
                height: 12,
                background: c,
                borderRadius: 2,
              }}
            />
          ))}
          <Text size="xs" c="text-secondary" ml={4}>
            {t`Heavy`}
          </Text>
        </Flex>
        <Flex gap={4} align="center">
          <Box
            style={{
              width: 18,
              height: 12,
              background: "var(--mb-color-bg-white)",
              backgroundImage: `linear-gradient(${BUSINESS_DAY_TINT}, ${BUSINESS_DAY_TINT})`,
              border: "1px solid var(--mb-color-border)",
              borderRadius: 2,
            }}
          />
          <Text size="xs" c="text-secondary">
            {t`Business hours (Mon–Fri, 9–5 ${timezone})`}
          </Text>
        </Flex>
        <Box style={{ flex: 1 }} />
        <Text size="xs" c="text-secondary">
          {t`Peak: ${scaleMax || "—"} jobs/hr`}
        </Text>
      </Group>
    </Box>
  );
}
