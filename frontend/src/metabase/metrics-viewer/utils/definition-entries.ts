import * as LibMetric from "metabase-lib/metric";

import type {
  MetricDefinitionEntry,
  MetricsViewerDefinitionEntry,
} from "../types/viewer-state";
import { isMetricEntry } from "../types/viewer-state";

export function getEntryBreakout(
  entry: MetricsViewerDefinitionEntry,
): LibMetric.ProjectionClause | undefined {
  if (!isMetricEntry(entry) || !entry.definition) {
    return undefined;
  }
  const projections = LibMetric.projections(entry.definition);
  return projections[0];
}

export function entryHasBreakout(entry: MetricsViewerDefinitionEntry): boolean {
  return getEntryBreakout(entry) !== undefined;
}

/**
 * Narrows a definition entry to a metric entry that has a non-null definition.
 * Useful for filtering arrays of entries to only metric entries with loaded definitions.
 */
export function isLoadedMetricEntry(
  entry: MetricsViewerDefinitionEntry,
): entry is MetricDefinitionEntry & {
  definition: NonNullable<MetricDefinitionEntry["definition"]>;
} {
  return isMetricEntry(entry) && entry.definition != null;
}
