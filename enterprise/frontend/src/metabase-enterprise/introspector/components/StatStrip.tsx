import { t } from "ttag";

import { Box, Card, Group, Text } from "metabase/ui";

import type { ConditionCounts, IntrospectorEntityType } from "../types";

interface Props {
  counts?: ConditionCounts;
  isLoading?: boolean;
  entityType?: IntrospectorEntityType;
}

type TileColor = "error" | "warning" | "brand" | "success";

type Tile = { label: string; value: number; color: TileColor };

export function StatStrip({
  counts,
  isLoading,
  entityType: _entityType,
}: Props) {
  // All three entity types now expose three distinct signals — Transforms got
  // its own time-based stale via `transform-stale-cte`, so the previous
  // collapse of stale==unreferenced is no longer needed.
  const tiles: Tile[] = [
    { label: t`Broken`, value: counts?.broken ?? 0, color: "error" },
    { label: t`Stale`, value: counts?.stale ?? 0, color: "warning" },
    {
      label: t`Unreferenced`,
      value: counts?.unreferenced ?? 0,
      color: "brand",
    },
    { label: t`Healthy`, value: counts?.healthy ?? 0, color: "success" },
  ];

  return (
    <Group grow gap="md" mb="md">
      {tiles.map(({ label, value, color }) => (
        <Card key={label} withBorder padding="md">
          <Text size="xs" tt="uppercase" c="text-secondary">
            {label}
          </Text>
          <Box mt={4}>
            <Text size="xl" fw={600} c={color}>
              {isLoading ? "—" : value.toLocaleString()}
            </Text>
          </Box>
        </Card>
      ))}
    </Group>
  );
}
