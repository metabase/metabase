import type { MetricDefinition } from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";
import type {
  MetricBreakoutValuesRequest,
  MetricDatasetRequest,
} from "metabase-types/api";

import type {
  MetricSourceId,
  MetricsViewerDefinitionEntry,
  MetricsViewerTabState,
} from "../types/viewer-state";

import { buildBinnedBreakoutDef } from "./queries";
import { computeModifiedDefinitions } from "./series";

export interface DatasetQueryKey {
  sourceId: MetricSourceId;
  request: MetricDatasetRequest;
}

export interface BreakoutQueryKey {
  sourceId: MetricSourceId;
  request: MetricBreakoutValuesRequest;
}

export function buildDatasetQueryKeys(
  definitions: MetricsViewerDefinitionEntry[],
  tab: MetricsViewerTabState,
): DatasetQueryKey[] {
  const modifiedDefinitions = computeModifiedDefinitions(definitions, tab);

  const executableDefs = tab.definitions.filter(
    (c) => c.projectionDimension != null || c.projectionDimensionId != null,
  );

  return executableDefs.flatMap((tabDef) => {
    const execDef = modifiedDefinitions.get(tabDef.definitionId);
    if (!execDef) {
      return [];
    }

    const definition = LibMetric.toJsMetricDefinition(execDef);
    return [
      {
        sourceId: tabDef.definitionId,
        request: { definition },
      },
    ];
  });
}

export function buildBreakoutQueryKeys(
  definitions: MetricsViewerDefinitionEntry[],
): BreakoutQueryKey[] {
  return definitions.flatMap((entry) => {
    if (!entry.definition || !entry.breakoutDimension) {
      return [];
    }

    const breakoutDef = buildBinnedBreakoutDef(
      entry.definition,
      entry.breakoutDimension,
    );
    const definition = LibMetric.toJsMetricDefinition(breakoutDef);

    return [
      {
        sourceId: entry.id,
        request: { definition },
      },
    ];
  });
}

export function getModifiedDefinitions(
  definitions: MetricsViewerDefinitionEntry[],
  tab: MetricsViewerTabState,
): Map<MetricSourceId, MetricDefinition> {
  return computeModifiedDefinitions(definitions, tab);
}
