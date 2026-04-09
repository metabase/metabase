import { NULL_DISPLAY_VALUE } from "metabase/lib/constants";
import { formatValue } from "metabase/lib/formatting";
import { isEmpty } from "metabase/lib/validate";
import * as LibMetric from "metabase-lib/metric";
import type { MetricBreakoutValuesResponse } from "metabase-types/api";

import type {
  MetricSourceId,
  MetricsViewerDefinitionEntry,
  SourceColorMap,
} from "../types/viewer-state";

import { getDefinitionName } from "./definition-builder";
import { entryHasBreakout, getEntryBreakout } from "./definition-entries";

export interface LegendItem {
  label: string;
  color: string;
}

export interface LegendGroup {
  header: string;
  subtitle?: string;
  items: LegendItem[];
}

export function buildLegendGroups(
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

    const definitionName = getDefinitionName(entry.definition);
    const breakoutProjection = getEntryBreakout(entry);

    if (breakoutProjection) {
      const response = breakoutValuesBySourceId.get(entry.id);
      if (!response || response.values.length === 0) {
        continue;
      }

      const rawDimension = LibMetric.projectionDimension(
        entry.definition,
        breakoutProjection,
      );
      const dimensionInfo = rawDimension
        ? LibMetric.displayInfo(entry.definition, rawDimension)
        : null;

      const items: LegendItem[] = response.values.map((val, index) => ({
        label: String(
          formatValue(isEmpty(val) ? NULL_DISPLAY_VALUE : val, {
            column: response.col,
          }),
        ),
        color: colors[index] ?? colors[colors.length - 1],
      }));

      const header =
        dimensionInfo?.longDisplayName ?? dimensionInfo?.displayName;
      if (!header) {
        continue;
      }

      groups.push({
        header,
        subtitle: definitionName ?? undefined,
        items,
      });
    } else {
      if (!definitionName) {
        continue;
      }
      groups.push({
        header: definitionName,
        items: [{ label: definitionName, color: colors[0] }],
      });
    }
  }

  return groups;
}
