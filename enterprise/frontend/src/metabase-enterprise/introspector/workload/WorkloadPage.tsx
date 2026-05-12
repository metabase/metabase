import { useMemo } from "react";
import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import { Alert, Box, Chip, Group, Stack, Text, Title } from "metabase/ui";

import { SlotExpansion } from "./SlotExpansion";
import { WorkloadGrid } from "./WorkloadGrid";
import { useGetWorkloadGridQuery, useGetWorkloadSlotQuery } from "./api";
import type { WorkloadCell, WorkloadJobType } from "./types";
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

function heroSentence(cells: WorkloadCell[]): string {
  const total = cells.reduce((s, c) => s + c.weight, 0);
  if (total === 0) {
    return t`No background jobs scheduled in the next 7 days.`;
  }
  return t`${total.toLocaleString()} background jobs scheduled across the next 7 days.`;
}

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
      <Stack gap="xs" mb="lg">
        <Title order={2}>{t`Workload`}</Title>
        <Text c="text-secondary">{heroSentence(grid?.cells ?? [])}</Text>
      </Stack>

      {grid?.scheduler_status === "stopped" && (
        <Alert color="warning" mb="md">
          {t`Scheduled jobs are paused on this instance — workload data is unavailable.`}
        </Alert>
      )}

      <WorkloadGrid
        cells={grid?.cells ?? []}
        scaleMax={grid?.scale_max ?? 0}
        isLoading={gridLoading}
        focusedSlot={params.slot}
        onSelectSlot={(slot) => setParams({ slot })}
        timezone={timezone}
      />

      <Group gap="xs" mt="sm" mb="lg">
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
