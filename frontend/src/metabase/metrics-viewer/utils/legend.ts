import * as LibMetric from "metabase-lib/metric";

import type {
  MetricsViewerDefinitionEntry,
  SourceBreakoutColorMap,
} from "../types/viewer-state";

import { getDefinitionName } from "./definition-builder";
import { entryHasBreakout, getEntryBreakout } from "./definition-entries";
import { getSingleColor } from "./series";

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
  activeBreakoutColors: SourceBreakoutColorMap,
): LegendGroup[] {
  // if the breakout has more than MAX_SERIES values, we don't show the breakout
  // in that case, the value in activeBreakoutColors is a string
  const hasAnyBreakout = definitions.some(
    (entry) =>
      entryHasBreakout(entry) && activeBreakoutColors[entry.id] instanceof Map,
  );
  if (!hasAnyBreakout) {
    return [];
  }

  const groups: LegendGroup[] = [];

  for (const entry of definitions) {
    if (!entry.definition) {
      continue;
    }

    const colors = activeBreakoutColors[entry.id];
    const definitionName = getDefinitionName(entry.definition);
    const breakoutProjection = getEntryBreakout(entry);

    if (breakoutProjection && colors instanceof Map) {
      const rawDimension = LibMetric.projectionDimension(
        entry.definition,
        breakoutProjection,
      );
      const dimensionInfo = rawDimension
        ? LibMetric.displayInfo(entry.definition, rawDimension)
        : null;

      const items: LegendItem[] = Array.from(colors.entries()).map(
        ([breakoutValue, color]) => ({
          label: breakoutValue,
          color,
        }),
      );

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
      const color = getSingleColor(colors);
      if (!color || !definitionName) {
        continue;
      }
      groups.push({
        header: definitionName,
        items: [{ label: definitionName, color }],
      });
    }
  }

  return groups;
}
