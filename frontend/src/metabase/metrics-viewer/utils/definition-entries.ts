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
