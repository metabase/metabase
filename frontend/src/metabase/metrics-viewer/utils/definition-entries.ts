import * as LibMetric from "metabase-lib/metric";

import type { MetricsViewerDefinitionEntry } from "../types/viewer-state";

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
