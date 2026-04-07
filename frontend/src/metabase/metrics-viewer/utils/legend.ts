import { NULL_DISPLAY_VALUE } from "metabase/lib/constants";
import { formatValue } from "metabase/lib/formatting";
import { isEmpty } from "metabase/lib/validate";
import * as LibMetric from "metabase-lib/metric";
import type { MetricBreakoutValuesResponse } from "metabase-types/api";

import {
  type MetricSourceId,
  type MetricsViewerDefinitionEntry,
  type MetricsViewerFormulaEntity,
  type SourceColorMap,
  isExpressionEntry,
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
  key: number;
  header: string;
  subtitle?: string;
  items: LegendItem[];
}

export function buildLegendGroups(
  formulaEntities: MetricsViewerFormulaEntity[],
  definitions: Record<MetricSourceId, MetricsViewerDefinitionEntry>,
  breakoutValuesByEntityIndex: Map<number, MetricBreakoutValuesResponse>,
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

  const groups: LegendGroup[] = [];

  formulaEntities.forEach((entity, entityIndex) => {
    const colors = sourceColors[entityIndex];
    if (!colors || colors.length === 0) {
      return;
    }

    if (isExpressionEntry(entity)) {
      groups.push({
        key: entityIndex,
        header: entity.name,
        items: [{ label: entity.name, color: colors[0] }],
      });
      return;
    }

    const effectiveEntry = getEffectiveDefinitionEntry(entity, definitions);
    if (!effectiveEntry.definition) {
      return;
    }

    const pristineDef = definitions[entity.id];
    const definitionName = getDefinitionName(
      pristineDef?.definition ?? effectiveEntry.definition,
    );
    const breakoutProjection = getEntryBreakout(effectiveEntry);

    if (breakoutProjection) {
      const response = breakoutValuesByEntityIndex.get(entityIndex);
      if (!response || response.values.length === 0) {
        return;
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
        return;
      }

      groups.push({
        key: entityIndex,
        header,
        subtitle: definitionName ?? undefined,
        items,
      });
    } else {
      if (!definitionName) {
        return;
      }
      groups.push({
        key: entityIndex,
        header: definitionName,
        items: [{ label: definitionName, color: colors[0] }],
      });
    }
  });

  return groups;
}
