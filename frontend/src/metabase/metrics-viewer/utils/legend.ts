import * as LibMetric from "metabase-lib/metric";

import {
  type MetricSourceId,
  type MetricsViewerDefinitionEntry,
  type MetricsViewerFormulaEntity,
  type SourceBreakoutColorMap,
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
  activeBreakoutColors: SourceBreakoutColorMap,
): LegendGroup[] {
  const hasAnyBreakout = formulaEntities.some((entity, entityIndex) => {
    if (!isMetricEntry(entity)) {
      return false;
    }
    return (
      entryHasBreakout(getEffectiveDefinitionEntry(entity, definitions)) &&
      activeBreakoutColors[entityIndex] instanceof Map
    );
  });

  if (!hasAnyBreakout) {
    return [];
  }

  const groups: LegendGroup[] = [];

  formulaEntities.forEach((entity, entityIndex) => {
    const colors = activeBreakoutColors[entityIndex];

    const getNextColor = () => {
      return typeof colors === "string"
        ? colors
        : colors instanceof Map
          ? colors.values().next().value
          : undefined;
    };

    if (isExpressionEntry(entity)) {
      const color = getNextColor();

      if (!color) {
        return;
      }

      groups.push({
        key: entityIndex,
        header: entity.name,
        items: [{ label: entity.name, color }],
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

    if (breakoutProjection && colors instanceof Map) {
      const rawDimension = LibMetric.projectionDimension(
        effectiveEntry.definition,
        breakoutProjection,
      );
      const dimensionInfo = rawDimension
        ? LibMetric.displayInfo(effectiveEntry.definition, rawDimension)
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
        return;
      }

      groups.push({
        key: entityIndex,
        header,
        subtitle: definitionName ?? undefined,
        items,
      });
    } else {
      const color = getNextColor();

      if (!definitionName || !color) {
        return;
      }
      groups.push({
        key: entityIndex,
        header: definitionName,
        items: [{ label: definitionName, color }],
      });
    }
  });

  return groups;
}
