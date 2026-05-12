import { useMemo } from "react";
import { t } from "ttag";

import { Anchor, Box, Group, Icon, Paper, Stack, Text } from "metabase/ui";

import type { WorkloadCell, WorkloadJobType } from "./types";

type Props = {
  cells: WorkloadCell[];
  timezone: string;
  onJumpToSlot: (slot: string) => void;
};

type Hotspot = {
  slot: string; // "YYYY-MM-DDTHH:00"
  weight: number;
  dominantType: WorkloadJobType | null;
  dominantTypeCount: number;
  reason: string;
};

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function formatSlot(slot: string, timezone: string): string {
  const date = new Date(`${slot}:00Z`);
  const datePart = date.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: timezone,
  });
  const timePart = date.toLocaleString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: timezone,
  });
  return `${datePart}, ${timePart}`;
}

function typeLabel(t_: WorkloadJobType): string {
  switch (t_) {
    case "sync":
      return t`database syncs`;
    case "transform-job":
      return t`transform runs`;
    case "alert":
      return t`alerts`;
    case "dashboard-subscription":
      return t`dashboard subscriptions`;
    case "persisted-refresh":
      return t`model cache refreshes`;
  }
}

// Pick up to 3 hotspots from the next 7 days.
// Heuristic: weight ≥ 1.8× the median non-zero weight AND ≥ 5 jobs in the slot,
// then top-N by weight. This filters out a uniformly busy week (nothing stands
// out) but still catches real pile-ups against a busy baseline.
function computeHotspots(cells: WorkloadCell[]): Hotspot[] {
  const positive = cells.filter((c) => c.weight > 0);
  if (positive.length === 0) {
    return [];
  }
  const sorted = [...positive.map((c) => c.weight)].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const threshold = Math.max(5, median * 1.8);

  const candidates = positive
    .filter((c) => c.weight >= threshold)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3);

  return candidates.map((c) => {
    const slot = `${c.day}T${pad2(c.hour)}:00`;
    const byType = c.by_type ?? {};
    const entries = Object.entries(byType) as [WorkloadJobType, number][];
    entries.sort((a, b) => b[1] - a[1]);
    const [dominantType, dominantCount] = entries[0] ?? [null, 0];
    const total = c.weight;
    const reason =
      dominantType && dominantCount / total >= 0.5
        ? t`${dominantCount} ${typeLabel(dominantType)} piling up — ${total} jobs total`
        : t`${total} jobs piling up across multiple types`;
    return {
      slot,
      weight: c.weight,
      dominantType,
      dominantTypeCount: dominantCount,
      reason,
    };
  });
}

export function HotspotList({ cells, timezone, onJumpToSlot }: Props) {
  const hotspots = useMemo(() => computeHotspots(cells), [cells]);

  if (hotspots.length === 0) {
    return null;
  }

  return (
    <Paper
      withBorder
      p="md"
      mb="md"
      style={{ background: "var(--mb-color-bg-light)" }}
    >
      <Group gap="xs" mb="sm" align="center">
        <Icon name="warning" c="warning" />
        <Text fw={600}>
          {hotspots.length === 1
            ? t`1 hotspot in the next 7 days`
            : t`${hotspots.length} hotspots in the next 7 days`}
        </Text>
      </Group>
      <Stack gap="xs">
        {hotspots.map((h) => (
          <Group key={h.slot} justify="space-between" wrap="nowrap">
            <Box style={{ minWidth: 0 }}>
              <Text size="sm" fw={500}>
                {formatSlot(h.slot, timezone)}
              </Text>
              <Text size="xs" c="text-secondary">
                {h.reason}
              </Text>
            </Box>
            <Anchor size="sm" onClick={() => onJumpToSlot(h.slot)}>
              {t`Investigate`}
            </Anchor>
          </Group>
        ))}
      </Stack>
    </Paper>
  );
}
