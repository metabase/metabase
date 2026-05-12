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

function bucketIndex(value: number, max: number): number {
  if (value <= 0 || max <= 0) {
    return 0;
  }
  const step = Math.max(1, Math.ceil(max / 5));
  return Math.min(5, Math.floor((value - 1) / step) + 1);
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
      m.set(`${c.day}T${String(c.hour).padStart(2, "0")}`, c);
    }
    return m;
  }, [cells]);

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
          gridTemplateColumns: "60px repeat(24, 1fr)",
          gap: 3,
        }}
      >
        <Box />
        {Array.from({ length: 24 }).map((_, h) => (
          <Text key={h} size="xs" c="text-secondary" ta="center">
            {h}
          </Text>
        ))}

        {days.map((day) => (
          <Fragment key={day}>
            <Text size="xs" c="text-secondary" style={{ alignSelf: "center" }}>
              {day.slice(5)}
            </Text>
            {Array.from({ length: 24 }).map((_, h) => {
              const slot = `${day}T${String(h).padStart(2, "0")}`;
              const cell = byKey.get(slot);
              const value = cell?.weight ?? 0;
              const i = bucketIndex(value, scaleMax);
              const focused = focusedSlot === slot;
              return (
                <Box
                  key={slot}
                  onClick={() => onSelectSlot(slot)}
                  style={{
                    aspectRatio: "1.2 / 1",
                    background: COLORS[i],
                    borderRadius: 3,
                    outline: focused ? "2.5px solid #ef4444" : undefined,
                    outlineOffset: focused ? 1 : 0,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 9,
                    color: i >= 3 ? "rgba(255,255,255,0.9)" : "#1e3a8a",
                  }}
                  title={`${slot} — ${value} units`}
                >
                  {value > 0 ? value : ""}
                </Box>
              );
            })}
          </Fragment>
        ))}
      </Box>

      <Group mt="sm" gap={6} align="center">
        <Text size="xs" c="text-secondary">{t`Units of work scheduled`}</Text>
        <Flex gap={2}>
          {COLORS.map((c) => (
            <Box
              key={c}
              style={{ width: 14, height: 14, background: c, borderRadius: 2 }}
            />
          ))}
        </Flex>
        <Text size="xs" c="text-secondary">
          0
        </Text>
        <Box style={{ flex: 1 }} />
        <Text size="xs" c="text-secondary">
          {scaleMax || "—"}
        </Text>
      </Group>
    </Box>
  );
}
