import { useMemo } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import {
  Alert,
  Anchor,
  Box,
  Chip,
  Group,
  SegmentedControl,
  Stack,
  Text,
  Title,
} from "metabase/ui";

import { SlotExpansion } from "./SlotExpansion";
import { WorkloadGrid } from "./WorkloadGrid";
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

export function WorkloadPage() {
  const { params, setParams, range, slotRange } = useWorkloadParams();

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

  const { data: slotRows, isFetching: slotLoading } = useGetWorkloadSlotQuery(
    slotRange
      ? {
          from: slotRange.from,
          to: slotRange.to,
          types: params.types.length > 0 ? params.types.join(",") : undefined,
        }
      : { from: "", to: "" },
    { skip: !slotRange },
  );

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
        <Group gap="md">
          <Anchor component={Link} to="/admin/introspector" c="text-secondary">
            {t`Content`}
          </Anchor>
          <Anchor component={Link} to="/admin/introspector/workload" fw={600}>
            {t`Workload`}
          </Anchor>
        </Group>
      </Stack>

      {grid?.scheduler_status === "stopped" && (
        <Alert color="warning" mb="md">
          {t`The Quartz scheduler isn't running on this instance — workload data is unavailable.`}
        </Alert>
      )}

      <Stack gap="sm" mb="md">
        <Group justify="space-between">
          <SegmentedControl
            value={params.range}
            onChange={(v) =>
              setParams({ range: v as "forecast" | "history", slot: null })
            }
            data={[
              { value: "forecast", label: t`Forecast (next 7d)` },
              { value: "history", label: t`History (last 7d)` },
            ]}
          />
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
              {tt}
            </Chip>
          ))}
        </Group>
      </Stack>

      <WorkloadGrid
        cells={grid?.cells ?? []}
        scaleMax={grid?.scale_max ?? 0}
        isLoading={gridLoading}
        focusedSlot={params.slot}
        onSelectSlot={(slot) => setParams({ slot })}
      />

      <SlotExpansion
        slot={params.slot}
        rows={slotRows}
        isLoading={slotLoading}
      />
    </Box>
  );
}
