import * as LibMetric from "metabase-lib/metric";

import type {
  ExpressionMetricSubToken,
  MetricDefinitionEntry,
  MetricSourceId,
  MetricsViewerDefinitionEntry,
} from "../types/viewer-state";

export function getEntryBreakout(
  entry: MetricsViewerDefinitionEntry,
): LibMetric.ProjectionClause | undefined {
  if (!entry.definition) {
    return undefined;
  }
  const projections = LibMetric.projections(entry.definition);
  return projections[0];
}

export function entryHasBreakout(entry: MetricsViewerDefinitionEntry): boolean {
  return getEntryBreakout(entry) !== undefined;
}

/**
 * Returns a definition entry with the "effective" definition for a formula entity.
 * If the entity has a per-instance definition (e.g. with breakout applied), uses that.
 * Otherwise falls back to the pristine definition from the shared definitions map.
 */
export function getEffectiveDefinitionEntry(
  entity: MetricDefinitionEntry,
  definitions: Record<MetricSourceId, MetricsViewerDefinitionEntry>,
): MetricDefinitionEntry {
  return {
    ...entity,
    definition: entity.definition ?? definitions[entity.id]?.definition ?? null,
  };
}

export function getEffectiveTokenDefinitionEntry(
  token: ExpressionMetricSubToken,
  definitions: Record<MetricSourceId, MetricsViewerDefinitionEntry>,
): MetricsViewerDefinitionEntry {
  return {
    id: token.sourceId,
    definition:
      token.definition ?? definitions[token.sourceId]?.definition ?? null,
  };
}

/**
 * Narrows a definition entry to one that has a non-null definition.
 * Useful for filtering arrays/maps of entries to only those with loaded definitions.
 */
export function isLoadedEntry(
  entry: MetricsViewerDefinitionEntry,
): entry is MetricsViewerDefinitionEntry & {
  definition: NonNullable<MetricsViewerDefinitionEntry["definition"]>;
} {
  return entry.definition != null;
}
