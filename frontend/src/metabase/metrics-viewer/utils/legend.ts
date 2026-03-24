import { NULL_DISPLAY_VALUE } from "metabase/lib/constants";
import { formatValue } from "metabase/lib/formatting";
import { isEmpty } from "metabase/lib/validate";
import * as LibMetric from "metabase-lib/metric";
import type { MetricBreakoutValuesResponse } from "metabase-types/api";

import type {
  MetricSourceId,
  MetricsViewerDefinitionEntry,
  MetricsViewerFormulaEntity,
  SourceColorMap,
} from "../types/viewer-state";
import { isMetricEntry } from "../types/viewer-state";

import { getDefinitionName } from "./definition-builder";
import {
  entryHasBreakout,
  getEffectiveDefinitionEntry,
  getEntryBreakout,
} from "./definition-entries";

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
  formulaEntities: MetricsViewerFormulaEntity[],
  definitions: Record<MetricSourceId, MetricsViewerDefinitionEntry>,
  breakoutValuesBySourceId: Map<MetricSourceId, MetricBreakoutValuesResponse>,
  sourceColors: SourceColorMap,
): LegendGroup[] {
  const hasAnyBreakout = formulaEntities.some((entity) => {
    if (!isMetricEntry(entity)) {
      return false;
    }
    return entryHasBreakout(getEffectiveDefinitionEntry(entity, definitions));
  });
  if (!hasAnyBreakout) {
    return [];
  }

  const sourceIdsWithBreakout = new Set<MetricSourceId>();
  for (const entity of formulaEntities) {
    if (
      isMetricEntry(entity) &&
      entryHasBreakout(getEffectiveDefinitionEntry(entity, definitions))
    ) {
      sourceIdsWithBreakout.add(entity.id);
    }
  }

  const groups: LegendGroup[] = [];

  for (const entity of formulaEntities) {
    if (!isMetricEntry(entity)) {
      continue;
    }

    const effectiveEntry = getEffectiveDefinitionEntry(entity, definitions);
    if (!effectiveEntry.definition) {
      continue;
    }

    const colors = sourceColors[entity.id];
    if (!colors || colors.length === 0) {
      continue;
    }

    const pristineDef = definitions[entity.id];
    const definitionName = getDefinitionName(
      pristineDef?.definition ?? effectiveEntry.definition,
    );
    const breakoutProjection = getEntryBreakout(effectiveEntry);

    if (breakoutProjection) {
      const response = breakoutValuesBySourceId.get(entity.id);
      if (!response || response.values.length === 0) {
        continue;
      }

      const rawDimension = LibMetric.projectionDimension(
        effectiveEntry.definition,
        breakoutProjection,
      );
      const dimensionInfo = rawDimension
        ? LibMetric.displayInfo(effectiveEntry.definition, rawDimension)
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
      if (!definitionName || sourceIdsWithBreakout.has(entity.id)) {
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
