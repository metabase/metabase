import * as Yup from "yup";

import * as Urls from "metabase/lib/urls";
import * as Lib from "metabase-lib";
import type { TemporalUnit } from "metabase-types/api";
import type {
  DateFilterSpec,
  DimensionOverrides,
  MetricSourceId,
  MetricsExplorerDisplayType,
  ProjectionConfig,
  SerializedExplorerState,
  SerializedSource,
  SerializedTab,
  SourceData,
  StoredDimensionTab,
} from "metabase-types/store/metrics-explorer";
import {
  createNumericProjectionConfig,
  createTemporalProjectionConfig,
  isTemporalProjectionConfig,
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
    value === "pie" ||
    value === "scatter"
  );
}

const dateFilterSpecSchema = Yup.object({
  type: Yup.string().oneOf(["relative", "specific", "exclude"]).required(),
});

const serializedTabSchema: Yup.ObjectSchema<SerializedTab> = Yup.object({
  id: Yup.string().required().min(1),
  type: Yup.string()
    .oneOf(["time", "geo", "category", "boolean", "numeric"] as const)
    .required(),
  label: Yup.string().required().min(1),
  cols: Yup.object().required(),
});

function isValidFilterSpec(value: unknown): value is DateFilterSpec {
  return dateFilterSpecSchema.isValidSync(value);
}

function isValidSerializedTab(value: unknown): value is SerializedTab {
  return serializedTabSchema.isValidSync(value);
}

export function encodeState(state: SerializedExplorerState): string {
  return btoa(JSON.stringify(state));
}

export function decodeState(hash: string): SerializedExplorerState {
  const defaultState: SerializedExplorerState = { sources: [] };

  if (!hash || hash.length <= 1) {
    return defaultState;
  }

  try {
    const encoded = hash.slice(1);
    const parsed = JSON.parse(atob(encoded));

    const result: SerializedExplorerState = { sources: [] };

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
      const { type, unit, filterSpec, binningStrategy } = parsed.projection;

      if (type === "numeric") {
        result.projection = {
          type: "numeric",
          binningStrategy:
            typeof binningStrategy === "string" || binningStrategy === null
              ? binningStrategy
              : null,
        };
      } else if (isTemporalUnit(unit)) {
        // Both explicit type: "temporal" and backward compat (no type field)
        result.projection = { type: "temporal", unit };

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

    if (Array.isArray(parsed.tabs)) {
      const validTabs: SerializedTab[] = [];
      for (const tab of parsed.tabs) {
        if (isValidSerializedTab(tab)) {
          validTabs.push(tab);
        }
      }
      if (validTabs.length > 0) {
        result.tabs = validTabs;
      }
    }

    return result;
  } catch {
    return defaultState;
  }
}

export function buildUrl(state: SerializedExplorerState): string {
  if (state.sources.length === 0) {
    return Urls.metricsExplorer();
  }
  return Urls.metricsExplorer(encodeState(state));
}

export function stateToSerializedState(
  sourceOrder: MetricSourceId[],
  sourceDataById: Record<MetricSourceId, SourceData>,
  projectionConfig: ProjectionConfig | null,
  dimensionOverrides: DimensionOverrides,
  displayType: MetricsExplorerDisplayType,
  activeTabId: string,
  dimensionTabs: StoredDimensionTab[] = [],
): SerializedExplorerState {
  const state: SerializedExplorerState = { sources: [] };

  state.sources = sourceOrder
    .map((sourceId) => {
      const sourceData = sourceDataById[sourceId];
      if (!sourceData) {
        const { type, id } = parseSourceId(sourceId);
        if (type === "metric") {
          return { type: "metric" as const, id };
        }
        console.warn(
          `Measure source ${sourceId} dropped from URL: tableId not yet loaded`,
        );
        return null;
      }
      if (sourceData.type === "metric") {
        return metricIdToSerializedSource(sourceId);
      }
      if (!sourceData.tableId) {
        console.warn(
          `Measure source ${sourceId} has no tableId in sourceData, skipping`,
        );
        return null;
      }
      return measureIdToSerializedSource(sourceId, sourceData.tableId);
    })
    .filter((s): s is SerializedSource => s !== null);

  if (projectionConfig) {
    if (isTemporalProjectionConfig(projectionConfig)) {
      state.projection = {
        type: "temporal",
        unit: projectionConfig.unit,
        filterSpec: projectionConfig.filterSpec ?? undefined,
      };
    } else {
      state.projection = {
        type: "numeric",
        binningStrategy: projectionConfig.binningStrategy,
      };
    }
  }

  const numericDimensions: Record<number, string> = {};
  for (const [sourceId, columnName] of Object.entries(dimensionOverrides)) {
    const { id } = parseSourceId(sourceId as MetricSourceId);
    numericDimensions[id] = columnName;
  }
  if (Object.keys(numericDimensions).length > 0) {
    state.dimensions = numericDimensions;
  }

  if (displayType !== "line") {
    state.display = displayType;
  }

  if (activeTabId !== "time") {
    state.activeTab = activeTabId;
  }

  if (dimensionTabs.length > 0) {
    state.tabs = dimensionTabs.map((tab) => storedTabToSerializedTab(tab));
  }

  return state;
}

function storedTabToSerializedTab(tab: StoredDimensionTab): SerializedTab {
  const cols: Record<number, string> = {};
  for (const [sourceId, columnName] of Object.entries(tab.columnsBySource)) {
    const { id } = parseSourceId(sourceId as MetricSourceId);
    cols[id] = columnName;
  }
  return {
    id: tab.id,
    type: tab.type,
    label: tab.label,
    cols,
  };
}

export function serializedStateToReduxState(
  serializedState: SerializedExplorerState,
): {
  sourceOrder: MetricSourceId[];
  projectionConfig: ProjectionConfig | null;
  dimensionOverrides: DimensionOverrides;
  displayType: MetricsExplorerDisplayType;
  activeTabId: string;
  dimensionTabs: StoredDimensionTab[];
  binningByTab: Record<string, string | null>;
  serializedSources: SerializedSource[];
} {
  const sourceOrder = serializedState.sources.map(serializedSourceToId);

  let projectionConfig: ProjectionConfig | null = null;
  if (serializedState.projection) {
    const proj = serializedState.projection;
    if (proj.type === "numeric") {
      projectionConfig = createNumericProjectionConfig(proj.binningStrategy ?? null);
    } else if (proj.unit) {
      projectionConfig = createTemporalProjectionConfig(proj.unit, proj.filterSpec ?? null);
    }
  }

  const dimensionOverrides: DimensionOverrides = {};
  if (serializedState.dimensions) {
    for (const [idStr, columnName] of Object.entries(
      serializedState.dimensions,
    )) {
      const id = parseInt(idStr, 10);
      const matchingSource = serializedState.sources.find((s) => s.id === id);
      if (matchingSource) {
        const sourceId = serializedSourceToId(matchingSource);
        dimensionOverrides[sourceId] = columnName;
      }
    }
  }

  const displayType = serializedState.display ?? "line";
  const activeTabId = serializedState.activeTab ?? "time";
  const binningByTab: Record<string, string | null> = {};

  const dimensionTabs: StoredDimensionTab[] = (serializedState.tabs ?? []).map(
    (serializedTab) => serializedTabToStoredTab(serializedTab, serializedState.sources),
  );

  return {
    sourceOrder,
    projectionConfig,
    dimensionOverrides,
    displayType,
    activeTabId,
    dimensionTabs,
    binningByTab,
    serializedSources: serializedState.sources,
  };
}

function serializedTabToStoredTab(
  serializedTab: SerializedTab,
  sources: SerializedSource[],
): StoredDimensionTab {
  const columnsBySource: Record<MetricSourceId, string> = {};

  for (const [idStr, columnName] of Object.entries(serializedTab.cols)) {
    const id = parseInt(idStr, 10);
    const matchingSource = sources.find((s) => s.id === id);
    if (matchingSource) {
      const sourceId = serializedSourceToId(matchingSource);
      columnsBySource[sourceId] = columnName;
    }
  }

  return {
    id: serializedTab.id,
    type: serializedTab.type,
    label: serializedTab.label,
    columnsBySource,
  };
}
