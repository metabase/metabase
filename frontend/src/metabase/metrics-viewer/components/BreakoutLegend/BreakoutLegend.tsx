import { useMemo } from "react";

import { NULL_DISPLAY_VALUE } from "metabase/lib/constants";
import { formatValue } from "metabase/lib/formatting";
import { isEmpty } from "metabase/lib/validate";
import { Box, Flex, Paper, Stack, Text } from "metabase/ui";
import * as LibMetric from "metabase-lib/metric";
import type { MetricBreakoutValuesResponse } from "metabase-types/api";

import { getDefinitionName } from "../../adapters/definition-loader";
import type {
  MetricSourceId,
  MetricsViewerDefinitionEntry,
  SourceColorMap,
} from "../../types/viewer-state";

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
  const hasAnyBreakout = definitions.some((e) => e.breakoutDimension != null);
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

    if (entry.breakoutDimension) {
      const response = breakoutValuesBySourceId.get(entry.id);
      if (!response || response.values.length === 0) {
        continue;
      }

      const dimInfo = LibMetric.displayInfo(
        entry.definition,
        entry.breakoutDimension,
      );

      const items: LegendItem[] = response.values.map((val, i) => ({
        label: String(
          formatValue(isEmpty(val) ? NULL_DISPLAY_VALUE : val, {
            column: response.col,
          }),
        ),
        color: colors[i] ?? colors[colors.length - 1],
      }));

      groups.push({
        header: dimInfo.longDisplayName ?? dimInfo.displayName,
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
    <Box className={S.root}>
      <Paper withBorder radius="md" p="lg">
        <Stack gap="lg">
          {groups.map((group, gi) => (
            <Stack key={gi} gap="sm">
              <div>
                <Text fw="bold" size="md" lh={1.3}>
                  {group.header}
                </Text>
                {group.subtitle && (
                  <Text size="sm" c="text-light" lh={1.3}>
                    {group.subtitle}
                  </Text>
                )}
              </div>
              {group.items.map((item, ii) => (
                <Flex key={ii} align="center" gap="sm">
                  <Box className={S.dot} bg={item.color} />
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
