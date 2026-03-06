import { useMemo } from "react";

import { NULL_DISPLAY_VALUE } from "metabase/lib/constants";
import { formatValue } from "metabase/lib/formatting";
import { isEmpty } from "metabase/lib/validate";
import { Box, Flex, Paper, Stack, Text, Title } from "metabase/ui";
import * as LibMetric from "metabase-lib/metric";
import type { MetricBreakoutValuesResponse } from "metabase-types/api";

import type {
  MetricSourceId,
  MetricsViewerDefinitionEntry,
  SourceColorMap,
} from "../../types/viewer-state";
import { getDefinitionName } from "../../utils/metrics";
import { entryHasBreakout, getEntryBreakout } from "../../utils/series";

import S from "./BreakoutLegend.module.css";

interface LegendItem {
  label: string;
  color: string;
}

interface LegendGroup {
  header: string;
  subtitle?: string;
  items: LegendItem[];
}

type BreakoutLegendProps = {
  definitions: MetricsViewerDefinitionEntry[];
  breakoutValuesBySourceId: Map<MetricSourceId, MetricBreakoutValuesResponse>;
  sourceColors: SourceColorMap;
};

function buildLegendGroups(
  definitions: MetricsViewerDefinitionEntry[],
  breakoutValuesBySourceId: Map<MetricSourceId, MetricBreakoutValuesResponse>,
  sourceColors: SourceColorMap,
): LegendGroup[] {
  const hasAnyBreakout = definitions.some((entry) => entryHasBreakout(entry));
  if (!hasAnyBreakout) {
    return [];
  }

  const groups: LegendGroup[] = [];

  for (const entry of definitions) {
    if (!entry.definition) {
      continue;
    }

    const colors = sourceColors[entry.id];
    if (!colors || colors.length === 0) {
      continue;
    }

    const defName = getDefinitionName(entry.definition);
    const breakoutProjection = getEntryBreakout(entry);

    if (breakoutProjection) {
      const response = breakoutValuesBySourceId.get(entry.id);
      if (!response || response.values.length === 0) {
        continue;
      }

      const rawDim = LibMetric.projectionDimension(
        entry.definition,
        breakoutProjection,
      );
      const dimInfo = rawDim
        ? LibMetric.displayInfo(entry.definition, rawDim)
        : null;

      const items: LegendItem[] = response.values.map((val, i) => ({
        label: String(
          formatValue(isEmpty(val) ? NULL_DISPLAY_VALUE : val, {
            column: response.col,
          }),
        ),
        color: colors[i] ?? colors[colors.length - 1],
      }));

      const header = dimInfo?.longDisplayName ?? dimInfo?.displayName;
      if (!header) {
        continue;
      }

      groups.push({
        header,
        subtitle: defName ?? undefined,
        items,
      });
    } else {
      if (!defName) {
        continue;
      }
      groups.push({
        header: defName,
        items: [{ label: defName, color: colors[0] }],
      });
    }
  }

  return groups;
}

export function BreakoutLegend({
  definitions,
  breakoutValuesBySourceId,
  sourceColors,
}: BreakoutLegendProps) {
  const groups = useMemo(
    () =>
      buildLegendGroups(definitions, breakoutValuesBySourceId, sourceColors),
    [definitions, breakoutValuesBySourceId, sourceColors],
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
            <Stack key={group.header} gap="sm">
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
