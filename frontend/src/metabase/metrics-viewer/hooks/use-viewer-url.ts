import { useEffect, useRef } from "react";
import { push, replace } from "react-router-redux";

import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import type { MetricDefinition } from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";
import type { MeasureId, TemporalUnit } from "metabase-types/api";
import type { MetricId } from "metabase-types/api/metric";

import {
  type MetricSourceId,
  type MetricsViewerDisplayType,
  type MetricsViewerPageState,
  type MetricsViewerTabState,
  type MetricsViewerTabType,
  getInitialMetricsViewerTabLayout,
} from "../types/viewer-state";
import { defineCompactSchema } from "../utils/compact-schema";
import type {
  DimensionFilterValue,
  SerializedDimensionFilterValue,
  SerializedSourceFilter,
} from "../utils/metrics";
import { extractDefinitionFilters } from "../utils/metrics";
import { getEntryBreakout } from "../utils/series";
import {
  createMeasureSourceId,
  createMetricSourceId,
} from "../utils/source-ids";

interface SerializedUrlFilter {
  dimensionId: string;
  value: SerializedDimensionFilterValue;
}

interface SerializedSource {
  type: "metric" | "measure";
  id: number;
  tableId?: number;
  breakout?: string;
  filters?: SerializedUrlFilter[];
}

interface SerializedTabDef {
  definitionId: MetricSourceId;
  dimensionId?: string;
}

interface SerializedProjectionConfig {
  dimensionFilter?: SerializedDimensionFilterValue;
  temporalUnit?: TemporalUnit;
  binning?: string;
}

interface SerializedTab {
  id: string;
  type: MetricsViewerTabType;
  label: string;
  display: MetricsViewerDisplayType;
  definitions: SerializedTabDef[];
  p?: SerializedProjectionConfig;
}

interface SerializedMetricsViewerPageState {
  sources: SerializedSource[];
  tabs: SerializedTab[];
  selectedTabId: string | null;
}

function definitionToSource(def: MetricDefinition): SerializedSource | null {
  const metricId = LibMetric.sourceMetricId(def);
  if (metricId != null) {
    return { type: "metric", id: metricId };
  }
  const measureId = LibMetric.sourceMeasureId(def);
  if (measureId != null) {
    return { type: "measure", id: measureId };
  }
  return null;
}

function serializeDimensionFilter(
  value: DimensionFilterValue,
): SerializedDimensionFilterValue {
  if (value.type === "specific-date" || value.type === "time") {
    return {
      ...value,
      values: value.values.map((date: Date) => date.toISOString()),
    };
  }
  return value;
}

function deserializeDimensionFilter(
  raw: SerializedDimensionFilterValue,
): DimensionFilterValue {
  if (raw.type === "specific-date" || raw.type === "time") {
    return {
      ...raw,
      values: raw.values.map((isoString) => new Date(isoString)),
    };
  }
  return raw;
}

function tabToSerializedTab(tab: MetricsViewerTabState): SerializedTab {
  const { dimensionFilter, temporalUnit, binningStrategy } =
    tab.projectionConfig;
  const hasProjectionConfig =
    dimensionFilter !== undefined ||
    temporalUnit !== undefined ||
    binningStrategy;

  return {
    id: tab.id,
    type: tab.type,
    label: tab.label,
    display: tab.display,
    definitions: Object.entries(tab.dimensionMapping).map(
      ([sourceId, dimensionId]) => ({
        definitionId: sourceId as MetricSourceId,
        dimensionId,
      }),
    ),
    p: hasProjectionConfig
      ? {
          dimensionFilter: dimensionFilter
            ? serializeDimensionFilter(dimensionFilter)
            : undefined,
          temporalUnit,
          binning: binningStrategy,
        }
      : undefined,
  };
}

function stateToSerializedState(
  state: MetricsViewerPageState,
): SerializedMetricsViewerPageState {
  return {
    sources: state.definitions.flatMap((entry) => {
      if (!entry.definition) {
        return [];
      }
      const source = definitionToSource(entry.definition);
      if (!source) {
        return [];
      }
      const breakoutProjection = getEntryBreakout(entry);
      if (breakoutProjection) {
        const rawDim = LibMetric.projectionDimension(
          entry.definition,
          breakoutProjection,
        );
        if (rawDim) {
          const dimInfo = LibMetric.dimensionValuesInfo(
            entry.definition,
            rawDim,
          );
          source.breakout = dimInfo.id;
        }
      }

      const definitionFilters = extractDefinitionFilters(entry.definition);
      if (definitionFilters.length > 0) {
        source.filters = definitionFilters.map((filter) => ({
          dimensionId: filter.dimensionId,
          value: serializeDimensionFilter(filter.value),
        }));
      }

      return [source];
    }),
    tabs: state.tabs.map(tabToSerializedTab),
    selectedTabId: state.selectedTabId,
  };
}

const sourceFilterSchema = defineCompactSchema<SerializedUrlFilter>({
  dimensionId: "d",
  value: { key: "v" },
});

const sourceSchema = defineCompactSchema<SerializedSource>({
  type: "t",
  id: "i",
  tableId: { key: "T", optional: true },
  breakout: { key: "b", optional: true },
  filters: { key: "F", schema: sourceFilterSchema, optional: true },
});

const tabDefSchema = defineCompactSchema<SerializedTabDef>({
  definitionId: "i",
  dimensionId: { key: "d", optional: true },
});

const projectionConfigSchema = defineCompactSchema<SerializedProjectionConfig>({
  dimensionFilter: { key: "f", optional: true },
  temporalUnit: { key: "u", optional: true },
  binning: { key: "b", optional: true },
});

const tabSchema = defineCompactSchema<SerializedTab>({
  id: "i",
  type: "t",
  label: { key: "l", default: "" },
  display: { key: "d", default: "line" },
  definitions: { key: "D", schema: tabDefSchema, default: [] },
  p: { key: "p", schema: projectionConfigSchema, optional: true },
});

const rootSchema = defineCompactSchema<SerializedMetricsViewerPageState>({
  sources: { key: "s", schema: sourceSchema, default: [] },
  tabs: { key: "t", schema: tabSchema, default: [] },
  selectedTabId: { key: "a", default: null },
});

function encodeState(state: SerializedMetricsViewerPageState): string {
  return btoa(JSON.stringify(rootSchema.compact(state)));
}

function decodeState(hash: string): SerializedMetricsViewerPageState | null {
  const empty: SerializedMetricsViewerPageState = {
    sources: [],
    tabs: [],
    selectedTabId: null,
  };

  if (!hash || hash.length <= 1) {
    return empty;
  }

  try {
    return rootSchema.expand(JSON.parse(atob(hash.slice(1)))) ?? empty;
  } catch (err) {
    console.warn("Failed to decode metrics viewer URL state:", err);
    return empty;
  }
}

function buildUrl(state: SerializedMetricsViewerPageState): string {
  if (state.sources.length === 0) {
    return Urls.metricsViewer();
  }
  return Urls.metricsViewer(encodeState(state));
}

export interface LoadSourcesRequest {
  metricIds: MetricId[];
  measureIds: MeasureId[];
  breakoutBySourceId?: Record<MetricSourceId, string>;
  filtersBySourceId?: Record<MetricSourceId, SerializedSourceFilter[]>;
}

export function useViewerUrl(
  state: MetricsViewerPageState,
  initialize: (state: MetricsViewerPageState) => void,
  onLoadSources: (request: LoadSourcesRequest) => void,
): void {
  const dispatch = useDispatch();
  const lastHashRef = useRef<string | null>(null);
  const lastSearchRef = useRef<string | null>(null);
  const isInitializedRef = useRef(false);
  const skipNextUrlPushRef = useRef(false);

  useEffect(() => {
    const hash = window.location.hash;
    const search = window.location.search;

    if (hash || search === lastSearchRef.current) {
      return;
    }
    lastSearchRef.current = search;

    const params = new URLSearchParams(search);
    const metricId = params.get("metricId");

    if (metricId) {
      isInitializedRef.current = false;
      lastHashRef.current = null;

      const initialState: SerializedMetricsViewerPageState = {
        sources: [{ type: "metric", id: parseInt(metricId, 10) }],
        tabs: [],
        selectedTabId: null,
      };

      const newUrl = buildUrl(initialState);
      dispatch(replace(newUrl));
    }
  }, [dispatch]);

  useEffect(() => {
    const hash = window.location.hash;
    const search = window.location.search;
    const params = new URLSearchParams(search);

    if (!hash && params.has("metricId")) {
      return;
    }

    if (lastHashRef.current !== null && hash === lastHashRef.current) {
      return;
    }
    lastHashRef.current = hash;

    const serializedState = decodeState(hash);
    if (!serializedState) {
      return;
    }

    const metricIds: MetricId[] = [];
    const measureIds: MeasureId[] = [];
    const breakoutBySourceId: Record<MetricSourceId, string> = {};
    const filtersBySourceId: Record<MetricSourceId, SerializedSourceFilter[]> =
      {};

    for (const source of serializedState.sources) {
      const sourceId =
        source.type === "metric"
          ? createMetricSourceId(source.id)
          : createMeasureSourceId(source.id);

      if (source.type === "metric") {
        metricIds.push(source.id);
      } else if (source.type === "measure") {
        measureIds.push(source.id);
      }

      if (source.breakout) {
        breakoutBySourceId[sourceId] = source.breakout;
      }

      if (source.filters && source.filters.length > 0) {
        filtersBySourceId[sourceId] = source.filters.map(
          (serializedFilter) => ({
            dimensionId: serializedFilter.dimensionId,
            value: deserializeDimensionFilter(serializedFilter.value),
          }),
        );
      }
    }

    if (serializedState.tabs.length > 0) {
      const tabs: MetricsViewerTabState[] = serializedState.tabs.map((st) => {
        const dimensionMapping: Record<MetricSourceId, string> = {};
        for (const serializedDefinition of st.definitions) {
          if (serializedDefinition.dimensionId) {
            dimensionMapping[serializedDefinition.definitionId] =
              serializedDefinition.dimensionId;
          }
        }
        return {
          id: st.id,
          type: st.type,
          label: st.label,
          display: st.display,
          dimensionMapping,
          projectionConfig: {
            dimensionFilter: st.p?.dimensionFilter
              ? deserializeDimensionFilter(st.p.dimensionFilter)
              : undefined,
            temporalUnit: st.p?.temporalUnit,
            binningStrategy: st.p?.binning ?? undefined,
          },
          layout: getInitialMetricsViewerTabLayout(st.display),
        };
      });

      initialize({
        definitions: [],
        tabs,
        selectedTabId: serializedState.selectedTabId,
      });
    }

    if (metricIds.length > 0 || measureIds.length > 0) {
      const hasBreakouts = Object.keys(breakoutBySourceId).length > 0;
      const hasFilters = Object.keys(filtersBySourceId).length > 0;
      onLoadSources({
        metricIds,
        measureIds,
        breakoutBySourceId: hasBreakouts ? breakoutBySourceId : undefined,
        filtersBySourceId: hasFilters ? filtersBySourceId : undefined,
      });
    }

    skipNextUrlPushRef.current = true;
    isInitializedRef.current = true;
  }, [initialize, onLoadSources, dispatch]);

  useEffect(() => {
    if (!isInitializedRef.current) {
      return;
    }

    if (skipNextUrlPushRef.current) {
      skipNextUrlPushRef.current = false;
      return;
    }

    if (state.definitions.length === 0 && state.tabs.length > 0) {
      return;
    }

    const serializedState = stateToSerializedState(state);
    const newUrl = buildUrl(serializedState);
    const hashIndex = newUrl.indexOf("#");
    const newHash = hashIndex !== -1 ? newUrl.substring(hashIndex) : "";

    if (newHash !== lastHashRef.current) {
      lastHashRef.current = newHash;
      dispatch(push(newUrl));
    }
  }, [state, dispatch]);
}
