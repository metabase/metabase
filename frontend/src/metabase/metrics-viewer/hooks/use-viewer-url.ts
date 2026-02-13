import { useEffect, useRef } from "react";
import { push, replace } from "react-router-redux";

import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import type { DatePickerValue } from "metabase/querying/common/types";
import type { MetricDefinition } from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";
import type { MeasureId, TemporalUnit } from "metabase-types/api";
import type { MetricId } from "metabase-types/api/metric";

import type {
  MetricSourceId,
  MetricsViewerDisplayType,
  MetricsViewerPageState,
  MetricsViewerTabState,
  MetricsViewerTabType,
} from "../types/viewer-state";
import { defineCompactSchema } from "../utils/compact-schema";
import {
  createMeasureSourceId,
  createMetricSourceId,
} from "../utils/source-ids";

interface SerializedSource {
  type: "metric" | "measure";
  id: number;
  tableId?: number;
  breakout?: string;
}

interface SerializedTabDef {
  definitionId: MetricSourceId;
  dimensionId?: string;
}

interface SerializedTab {
  id: string;
  type: MetricsViewerTabType;
  label: string;
  display: MetricsViewerDisplayType;
  definitions: SerializedTabDef[];
  filter?: DatePickerValue;
  temporalUnit?: TemporalUnit;
  binning?: string | null;
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

function tabToSerializedTab(tab: MetricsViewerTabState): SerializedTab {
  return {
    id: tab.id,
    type: tab.type,
    label: tab.label,
    display: tab.display,
    definitions: tab.definitions.map((td) => ({
      definitionId: td.definitionId,
      dimensionId: td.projectionDimensionId,
    })),
    filter: tab.filter,
    temporalUnit: tab.projectionTemporalUnit,
    binning: tab.binningStrategy,
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
      if (entry.breakoutDimension) {
        const dimInfo = LibMetric.dimensionValuesInfo(
          entry.definition,
          entry.breakoutDimension,
        );
        source.breakout = dimInfo.id;
      }
      return [source];
    }),
    tabs: state.tabs.map(tabToSerializedTab),
    selectedTabId: state.selectedTabId,
  };
}

const sourceSchema = defineCompactSchema<SerializedSource>({
  type: "t",
  id: "i",
  tableId: { key: "T", optional: true },
  breakout: { key: "b", optional: true },
});

const tabDefSchema = defineCompactSchema<SerializedTabDef>({
  definitionId: "i",
  dimensionId: { key: "d", optional: true },
});

const tabSchema = defineCompactSchema<SerializedTab>({
  id: "i",
  type: "t",
  label: { key: "l", default: "" },
  display: { key: "d", default: "line" },
  definitions: { key: "D", schema: tabDefSchema, default: [] },
  filter: { key: "f", optional: true },
  temporalUnit: { key: "u", optional: true },
  binning: { key: "b", optional: true },
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
  } catch {
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

    for (const source of serializedState.sources) {
      if (source.type === "metric") {
        metricIds.push(source.id);
        if (source.breakout) {
          breakoutBySourceId[createMetricSourceId(source.id)] = source.breakout;
        }
      } else if (source.type === "measure") {
        measureIds.push(source.id);
        if (source.breakout) {
          breakoutBySourceId[createMeasureSourceId(source.id)] =
            source.breakout;
        }
      }
    }

    if (serializedState.tabs.length > 0) {
      const tabs: MetricsViewerTabState[] = serializedState.tabs.map((st) => ({
        id: st.id,
        type: st.type,
        label: st.label,
        display: st.display,
        definitions: st.definitions.map((d) => ({
          definitionId: d.definitionId,
          projectionDimensionId: d.dimensionId,
        })),
        filter: st.filter,
        projectionTemporalUnit: st.temporalUnit,
        binningStrategy: st.binning ?? null,
      }));

      initialize({
        definitions: [],
        tabs,
        selectedTabId: serializedState.selectedTabId,
      });
    }

    if (metricIds.length > 0 || measureIds.length > 0) {
      const hasBreakouts = Object.keys(breakoutBySourceId).length > 0;
      onLoadSources({
        metricIds,
        measureIds,
        breakoutBySourceId: hasBreakouts ? breakoutBySourceId : undefined,
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
    const newHash = newUrl.includes("#") ? `#${newUrl.split("#")[1]}` : "";

    if (newHash !== lastHashRef.current) {
      lastHashRef.current = newHash;
      dispatch(push(newUrl));
    }
  }, [state, dispatch]);
}

export { decodeState, encodeState, buildUrl, stateToSerializedState };
