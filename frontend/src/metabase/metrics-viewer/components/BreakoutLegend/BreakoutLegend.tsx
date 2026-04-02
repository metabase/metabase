import { useMemo } from "react";

import { Box, Flex, Paper, Stack, Text, Title } from "metabase/ui";
import type { MetricBreakoutValuesResponse } from "metabase-types/api";

import type {
  MetricSourceId,
  MetricsViewerDefinitionEntry,
  MetricsViewerFormulaEntity,
  SourceColorMap,
} from "../../types/viewer-state";
import { buildLegendGroups } from "../../utils/legend";

import S from "./BreakoutLegend.module.css";

type BreakoutLegendProps = {
  formulaEntities: MetricsViewerFormulaEntity[];
  definitions: Record<MetricSourceId, MetricsViewerDefinitionEntry>;
  breakoutValuesByEntityIndex: Map<number, MetricBreakoutValuesResponse>;
  sourceColors: SourceColorMap;
};

export function BreakoutLegend({
  formulaEntities,
  definitions,
  breakoutValuesByEntityIndex,
  sourceColors,
}: BreakoutLegendProps) {
  const groups = useMemo(
    () =>
      buildLegendGroups(
        formulaEntities,
        definitions,
        breakoutValuesByEntityIndex,
        sourceColors,
      ),
    [formulaEntities, definitions, breakoutValuesByEntityIndex, sourceColors],
  );

  if (groups.length === 0) {
    return null;
  }

  return (
    <Box
      className={S.root}
      w="16rem"
      pt="md"
      pr="lg"
      pb="md"
      pl={0}
      data-testid="metrics-viewer-breakout-legend"
    >
      <Paper withBorder radius="md" p="lg">
        <Stack gap="lg">
          {groups.map((group) => (
            <Stack key={group.key} gap="sm">
              <div>
                <Title fw="bold" size="md" lh={1.3}>
                  {group.header}
                </Title>
                {group.subtitle && (
                  <Text size="sm" c="text-tertiary" lh={1.3}>
                    {group.subtitle}
                  </Text>
                )}
              </div>
              {group.items.map((item) => (
                <Flex key={item.label} align="center" gap="sm">
                  <Box
                    className={S.dot}
                    data-testid="breakout-legend-dot"
                    w="0.625rem"
                    h="0.625rem"
                    bdrs="50%"
                    style={{ background: item.color }}
                  />
                  <Text size="md" lh={1}>
                    {item.label}
                  </Text>
                </Flex>
              ))}
            </Stack>
          ))}
        </Stack>
      </Paper>
    </Box>
  );
}
