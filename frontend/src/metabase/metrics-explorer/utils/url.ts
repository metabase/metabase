import type { DateFilterSpec } from "metabase-lib";
import * as Lib from "metabase-lib";
import * as Urls from "metabase/lib/urls";
import type { TemporalUnit } from "metabase-types/api";
import type {
  DimensionOverrides,
  MetricSourceId,
  MetricsExplorerDisplayType,
  ProjectionConfig,
  SerializedExplorerState,
  SerializedSource,
  SourceData,
} from "metabase-types/store/metrics-explorer";

import {
  measureIdToSerializedSource,
  metricIdToSerializedSource,
  normalizeSerializedSource,
  parseSourceId,
  serializedSourceToId,
} from "./source-ids";

function isTemporalUnit(value: unknown): value is TemporalUnit {
  return (
    typeof value === "string" &&
    Lib.availableTemporalUnits().includes(value as TemporalUnit)
  );
}

function isMetricsExplorerDisplayType(
  value: unknown,
): value is MetricsExplorerDisplayType {
  return (
    value === "line" ||
    value === "area" ||
    value === "bar" ||
    value === "map" ||
    value === "row" ||
    value === "pie"
  );
}

function isValidFilterSpec(value: unknown): value is DateFilterSpec {
  if (!value || typeof value !== "object") {
    return false;
  }
  const spec = value as Record<string, unknown>;
  return (
    spec.type === "relative" ||
    spec.type === "specific" ||
    spec.type === "exclude"
  );
}

/**
 * Encode explorer state to a URL hash string.
 */
export function encodeState(state: SerializedExplorerState): string {
  return btoa(JSON.stringify(state));
}

/**
 * Decode a URL hash string to explorer state.
 */
export function decodeState(hash: string): SerializedExplorerState {
  const defaultState: SerializedExplorerState = { sources: [] };

  if (!hash || hash.length <= 1) {
    return defaultState;
  }

  try {
    const encoded = hash.slice(1); // Remove leading #
    const parsed = JSON.parse(atob(encoded));

    const result: SerializedExplorerState = { sources: [] };

    // New format: sources array (handles both new and old abbreviated formats)
    if (Array.isArray(parsed.sources)) {
      result.sources = parsed.sources
        .map(normalizeSerializedSource)
        .filter(
          (s: SerializedSource | null): s is SerializedSource => s !== null,
        );
    }
    // Backward compatibility: convert ancient "metrics" array (plain numbers) to new format
    else if (Array.isArray(parsed.metrics)) {
      result.sources = parsed.metrics
        .filter(
          (id: unknown) =>
            typeof id === "number" && Number.isInteger(id) && id > 0,
        )
        .map((id: number): SerializedSource => ({ type: "metric", id }));
    }

    if (parsed.projection && typeof parsed.projection === "object") {
      const { unit, filterSpec } = parsed.projection;
      if (isTemporalUnit(unit)) {
        result.projection = { unit };

        if (isValidFilterSpec(filterSpec)) {
          result.projection.filterSpec = filterSpec;
        }
      }
    }

    if (parsed.dimensions && typeof parsed.dimensions === "object") {
      const validDimensions: Record<number, string> = {};
      for (const [key, value] of Object.entries(parsed.dimensions)) {
        const numKey = parseInt(key, 10);
        if (
          !isNaN(numKey) &&
          numKey > 0 &&
          typeof value === "string" &&
          value.length > 0
        ) {
          validDimensions[numKey] = value;
        }
      }
      if (Object.keys(validDimensions).length > 0) {
        result.dimensions = validDimensions;
      }
    }

    if (isMetricsExplorerDisplayType(parsed.display)) {
      result.display = parsed.display;
    }

    if (typeof parsed.activeTab === "string" && parsed.activeTab.length > 0) {
      result.activeTab = parsed.activeTab;
    }

    return result;
  } catch {
    return defaultState;
  }
}

/**
 * Build URL path from explorer state.
 */
export function buildUrl(state: SerializedExplorerState): string {
  if (state.sources.length === 0) {
    return Urls.metricsExplorer();
  }
  return Urls.metricsExplorer(encodeState(state));
}

/**
 * Convert Redux state to serialized URL state.
 */
export function stateToSerializedState(
  sourceOrder: MetricSourceId[],
  sourceDataById: Record<MetricSourceId, SourceData>,
  projectionConfig: ProjectionConfig | null,
  dimensionOverrides: DimensionOverrides,
  displayType: MetricsExplorerDisplayType,
  activeTabId: string,
): SerializedExplorerState {
  const state: SerializedExplorerState = { sources: [] };

  // Convert source IDs to serialized format
  state.sources = sourceOrder
    .map((sourceId) => {
      const sourceData = sourceDataById[sourceId];
      if (!sourceData) {
        // Still include it even if data not loaded yet
        const { type, id } = parseSourceId(sourceId);
        if (type === "metric") {
          return { type: "metric" as const, id };
        }
        // For measures without data, we can't include them (need tableId)
        console.warn(
          `Measure source ${sourceId} dropped from URL: tableId not yet loaded`,
        );
        return null;
      }
      if (sourceData.type === "metric") {
        return metricIdToSerializedSource(sourceId);
      }
      // Defensive check: ensure tableId exists for measures
      if (!sourceData.tableId) {
        console.warn(
          `Measure source ${sourceId} has no tableId in sourceData, skipping`,
        );
        return null;
      }
      return measureIdToSerializedSource(sourceId, sourceData.tableId);
    })
    .filter((s): s is SerializedSource => s !== null);

  // Add projection config
  if (projectionConfig) {
    state.projection = {
      unit: projectionConfig.unit,
      filterSpec: projectionConfig.filterSpec ?? undefined,
    };
  }

  // Convert dimension overrides to numeric keys
  const numericDimensions: Record<number, string> = {};
  for (const [sourceId, columnName] of Object.entries(dimensionOverrides)) {
    const { id } = parseSourceId(sourceId as MetricSourceId);
    numericDimensions[id] = columnName;
  }
  if (Object.keys(numericDimensions).length > 0) {
    state.dimensions = numericDimensions;
  }

  // Add display type (only if not default)
  if (displayType !== "line") {
    state.display = displayType;
  }

  // Add active tab (only if not default "time")
  if (activeTabId !== "time") {
    state.activeTab = activeTabId;
  }

  return state;
}

/**
 * Convert serialized URL state to Redux-compatible state values.
 */
export function serializedStateToReduxState(
  serializedState: SerializedExplorerState,
): {
  sourceOrder: MetricSourceId[];
  projectionConfig: ProjectionConfig | null;
  dimensionOverrides: DimensionOverrides;
  displayType: MetricsExplorerDisplayType;
  activeTabId: string;
  serializedSources: SerializedSource[];
} {
  const sourceOrder = serializedState.sources.map(serializedSourceToId);

  const projectionConfig: ProjectionConfig | null = serializedState.projection
    ? {
        unit: serializedState.projection.unit,
        filterSpec: serializedState.projection.filterSpec ?? null,
      }
    : null;

  const dimensionOverrides: DimensionOverrides = {};
  if (serializedState.dimensions) {
    for (const [idStr, columnName] of Object.entries(
      serializedState.dimensions,
    )) {
      const id = parseInt(idStr, 10);
      // We need to figure out if this is a metric or measure
      // Look in the sources to determine the type
      const matchingSource = serializedState.sources.find((s) => s.id === id);
      if (matchingSource) {
        const sourceId = serializedSourceToId(matchingSource);
        dimensionOverrides[sourceId] = columnName;
      }
    }
  }

  const displayType = serializedState.display ?? "line";
  const activeTabId = serializedState.activeTab ?? "time";

  return {
    sourceOrder,
    projectionConfig,
    dimensionOverrides,
    displayType,
    activeTabId,
    serializedSources: serializedState.sources,
  };
}
