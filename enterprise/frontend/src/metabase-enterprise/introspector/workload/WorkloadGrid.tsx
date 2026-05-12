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

// Quantile-based thresholds: divide non-zero weights into 5 buckets at the
// 20/40/60/80 percentiles. Adapts to skewed distributions far better than a
// linear (max/5) split — a long tail of outliers doesn't wash out the rest.
function computeThresholds(cells: WorkloadCell[]): number[] {
  const sorted = cells
    .map((c) => c.weight)
    .filter((w) => w > 0)
    .sort((a, b) => a - b);
  if (sorted.length === 0) {
    return [];
  }
  const pct = (p: number) => sorted[Math.floor((sorted.length - 1) * p)];
  // De-duplicate so heavily-tied distributions still produce sensible bands.
  return Array.from(new Set([pct(0.2), pct(0.4), pct(0.6), pct(0.8)]));
}

function bucketIndex(value: number, thresholds: number[]): number {
  if (value <= 0) {
    return 0;
  }
  // Find the first threshold the value is <=; bucket index is 1 + that index.
  // Values above the top threshold land in the darkest bucket (5).
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

export function WorkloadGrid({
  cells,
  scaleMax,
  isLoading,
  focusedSlot,
  onSelectSlot,
}: Props) {
  const days = useMemo(() => daysInRange(cells), [cells]);
  const byKey = useMemo(() => {
    const m = new Map<string, WorkloadCell>();
    for (const c of cells) {
      // Fall back to minute=0 when the BE response predates 5/10-min bucketing —
      // keeps the heatmap usable while the BE namespace reloads.
      const minute = typeof c.minute === "number" ? c.minute : 0;
      m.set(`${c.day}T${pad2(c.hour)}:${pad2(minute)}`, c);
    }
    return m;
  }, [cells]);

  const thresholds = useMemo(() => computeThresholds(cells), [cells]);

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
      {/* Header: blank corner + 24 hour columns */}
      <Box
        style={{
          display: "grid",
          gridTemplateColumns: "64px repeat(24, 1fr)",
          gap: 2,
          marginBottom: 4,
        }}
      >
        <Box />
        {Array.from({ length: 24 }).map((_, h) => (
          <Text key={h} size="xs" c="text-secondary" ta="center">
            {pad2(h)}
          </Text>
        ))}
      </Box>

      {/* Grid: one row per day, 24 cells per row */}
      <Box
        style={{
          display: "grid",
          gridTemplateColumns: "64px repeat(24, 1fr)",
          gap: 2,
          alignItems: "stretch",
        }}
      >
        {days.map((day) => (
          <Fragment key={day}>
            <Text
              size="xs"
              c="text-secondary"
              style={{
                alignSelf: "center",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {day.slice(5)}
            </Text>
            {Array.from({ length: 24 }).map((_, h) => {
              const slot = `${day}T${pad2(h)}:00`;
              const cell = byKey.get(slot);
              const value = cell?.weight ?? 0;
              const idx = bucketIndex(value, thresholds);
              const focused = focusedSlot === slot;
              return (
                <Box
                  key={slot}
                  onClick={() => onSelectSlot(slot)}
                  title={`${slot} — ${value} units`}
                  style={{
                    height: ROW_HEIGHT_PX,
                    background: COLORS[idx],
                    borderRadius: 3,
                    outline: focused ? "2.5px solid #ef4444" : undefined,
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
        ))}
      </Box>

      <Group mt="sm" gap={8} align="center">
        <Text size="xs" c="text-secondary">
          {t`Units of work scheduled per hour`}
        </Text>
        <Flex gap={4} align="center">
          {COLORS.map((c, i) => {
            // Label each swatch with its lower bound from the quantile thresholds.
            const lower =
              i === 0
                ? 0
                : i === 1
                  ? 1
                  : (thresholds[i - 2] ?? 0) + 1;
            return (
              <Flex key={c} direction="column" align="center" gap={0}>
                <Box
                  style={{
                    width: 18,
                    height: 12,
                    background: c,
                    borderRadius: 2,
                  }}
                />
                <Text size="xs" c="text-secondary">
                  {lower}
                </Text>
              </Flex>
            );
          })}
        </Flex>
        <Box style={{ flex: 1 }} />
        <Text size="xs" c="text-secondary">
          {t`peak ${scaleMax || "—"}`}
        </Text>
      </Group>
    </Box>
  );
}
