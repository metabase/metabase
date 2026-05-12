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

export function StatStrip({ counts, isLoading, entityType }: Props) {
  // For transforms, `stale` and `unreferenced` are the same concept on the wire
  // (no time-based stale signal — see queries.clj :summary). Drop the redundant
  // `Unreferenced` tile so we don't show the same number twice in the strip.
  const isTransforms = entityType === "transforms";
  const tiles: Tile[] = [
    { label: t`Broken`, value: counts?.broken ?? 0, color: "error" },
    { label: t`Stale`, value: counts?.stale ?? 0, color: "warning" },
    ...(isTransforms
      ? []
      : [
          {
            label: t`Unreferenced`,
            value: counts?.unreferenced ?? 0,
            color: "brand" as TileColor,
          },
        ]),
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
