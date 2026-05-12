import { useMemo } from "react";
import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import {
  Alert,
  Anchor,
  Box,
  Chip,
  Group,
  Stack,
  Text,
  Title,
} from "metabase/ui";

import { HotspotList } from "./HotspotList";
import { SlotExpansion } from "./SlotExpansion";
import { WorkloadGrid } from "./WorkloadGrid";
import { WorkloadStatStrip } from "./WorkloadStatStrip";
import { useGetWorkloadGridQuery, useGetWorkloadSlotQuery } from "./api";
import type { WorkloadJobType } from "./types";
import { useWorkloadParams } from "./useWorkloadParams";

const JOB_TYPES: WorkloadJobType[] = [
  "sync",
  "transform-job",
  "alert",
  "dashboard-subscription",
  "persisted-refresh",
];

const JOB_TYPE_LABEL: Record<WorkloadJobType, string> = {
  sync: "Database sync",
  "transform-job": "Transform run",
  alert: "Alert",
  "dashboard-subscription": "Subscription",
  "persisted-refresh": "Model cache refresh",
};

export function WorkloadPage() {
  const { params, setParams, range, tableRange } = useWorkloadParams();
  const timezone = useSetting("system-timezone") || "UTC";

  const gridParams = useMemo(
    () => ({
      from: range.from,
      to: range.to,
      types: params.types.length > 0 ? params.types.join(",") : undefined,
    }),
    [range, params.types],
  );

  const { data: grid, isFetching: gridLoading } =
    useGetWorkloadGridQuery(gridParams);

  const { data: slotRows, isFetching: slotLoading } = useGetWorkloadSlotQuery({
    from: tableRange.from,
    to: tableRange.to,
    types: params.types.length > 0 ? params.types.join(",") : undefined,
  });

  const toggleType = (tt: WorkloadJobType) => {
    const next = params.types.includes(tt)
      ? params.types.filter((x) => x !== tt)
      : [...params.types, tt];
    setParams({ types: next });
  };

  return (
    <Box p="lg" style={{ maxWidth: 1200, margin: "0 auto" }}>
      <Stack gap="sm" mb="lg">
        <Title order={2}>{t`Workload`}</Title>
        <Text c="text-secondary" size="sm">
          {t`Scheduled background work across your instance. Click a cell to see what runs in that hour.`}
        </Text>
      </Stack>

      {grid?.scheduler_status === "stopped" && (
        <Alert color="warning" mb="md">
          {t`Scheduled jobs are paused on this instance — workload data is unavailable.`}
        </Alert>
      )}

      <WorkloadStatStrip
        cells={grid?.cells ?? []}
        scaleMax={grid?.scale_max ?? 0}
        timezone={timezone}
        isLoading={gridLoading}
      />

      <Stack gap="sm" mb="md">
        <Group justify="space-between">
          <Text c="text-secondary" size="sm">
            {t`Showing the next 7 days · ${timezone}`}
          </Text>
          {params.types.length > 0 && (
            <Anchor size="sm" onClick={() => setParams({ types: [] })}>
              {t`Clear filters`}
            </Anchor>
          )}
        </Group>
        <Group gap="xs" align="center">
          <Text c="text-secondary" size="sm" mr="xs">
            {t`Filter by type:`}
          </Text>
          {JOB_TYPES.map((tt) => (
            <Chip
              key={tt}
              checked={params.types.includes(tt)}
              onChange={() => toggleType(tt)}
              size="sm"
              variant="outline"
              color="brand"
            >
              {JOB_TYPE_LABEL[tt]}
            </Chip>
          ))}
        </Group>
      </Stack>

      <HotspotList
        cells={grid?.cells ?? []}
        timezone={timezone}
        onJumpToSlot={(slot) => setParams({ slot })}
      />

      <WorkloadGrid
        cells={grid?.cells ?? []}
        scaleMax={grid?.scale_max ?? 0}
        isLoading={gridLoading}
        focusedSlot={params.slot}
        onSelectSlot={(slot) => setParams({ slot })}
        timezone={timezone}
      />

      <SlotExpansion
        slot={params.slot}
        rows={slotRows}
        isLoading={slotLoading}
        timezone={timezone}
        rangeFrom={range.from}
        rangeTo={range.to}
      />
    </Box>
  );
}
