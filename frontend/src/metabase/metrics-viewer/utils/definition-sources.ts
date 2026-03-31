import { t } from "ttag";

import type { MetricDefinition } from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";

import type {
  ExpressionSubToken,
  MetricSourceId,
  MetricsViewerDefinitionEntry,
  MetricsViewerFormulaEntity,
} from "../types/viewer-state";
import { isExpressionEntry, isMetricEntry } from "../types/viewer-state";

export type DefinitionSource = {
  index: number;
  id: MetricSourceId;
  definition: MetricDefinition;
  entity: MetricsViewerFormulaEntity;
  token?: Extract<ExpressionSubToken, { type: "metric" }>;
};

export function getDefinitionSources(
  formulaEntities: MetricsViewerFormulaEntity[],
  definitions: Record<MetricSourceId, MetricsViewerDefinitionEntry>,
): DefinitionSource[] {
  type MaybeDefinitionSource = Omit<
    DefinitionSource,
    "definition" | "index"
  > & {
    definition: DefinitionSource["definition"] | null;
  };
  const maybeDefinitionSources = formulaEntities.flatMap<MaybeDefinitionSource>(
    (entity) => {
      if (isMetricEntry(entity)) {
        return [
          {
            id: entity.id,
            definition: entity.definition ?? definitions[entity.id]?.definition,
            entity,
          },
        ];
      }
      if (isExpressionEntry(entity)) {
        return entity.tokens
          .filter((token) => token.type === "metric")
          .map((token) => ({
            id: token.sourceId,
            definition:
              token.definition ?? definitions[token.sourceId]?.definition,
            entity,
            token,
          }));
      }
      return [];
    },
  );
  // Assign stable indices before filtering so they don't shift as definitions
  // load asynchronously (formulaEntities are stable while the popover is open).
  return maybeDefinitionSources
    .map((source, index) => ({ ...source, index }))
    .filter((source): source is DefinitionSource => source.definition != null);
}

/**
 * Produces an updated formulaEntities array with a new definition applied
 * to the entity/token identified by the given DefinitionSource.
 * Uses identity comparison to find the correct entity and token.
 */
export function applyDefinitionToFormulaEntities(
  formulaEntities: MetricsViewerFormulaEntity[],
  source: DefinitionSource,
  newDefinition: MetricDefinition,
): MetricsViewerFormulaEntity[] {
  return formulaEntities.map((entity) => {
    if (entity !== source.entity) {
      return entity;
    }
    if (isMetricEntry(entity)) {
      return { ...entity, definition: newDefinition };
    }
    if (isExpressionEntry(entity)) {
      return {
        ...entity,
        tokens: entity.tokens.map((token) =>
          token === source.token
            ? { ...token, definition: newDefinition }
            : token,
        ),
      };
    }
    return entity;
  });
}

export function getDefinitionSourceName(source: DefinitionSource): string {
  const metric = LibMetric.sourceMetricOrMeasureMetadata(source.definition);
  if (metric) {
    const metricInfo = LibMetric.displayInfo(source.definition, metric);
    return metricInfo.displayName;
  }
  return t`Unknown`;
}

export function getDefinitionSourceIcon(
  source: DefinitionSource,
): "metric" | "ruler" | undefined {
  if (isMetricEntry(source.entity)) {
    const metricId = LibMetric.sourceMetricId(source.definition);
    return metricId != null ? "metric" : "ruler";
  }
  return undefined;
}
