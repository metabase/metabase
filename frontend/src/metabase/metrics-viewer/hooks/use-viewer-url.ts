import type { Location } from "history";
import { useEffect, useRef } from "react";
import { push, replace } from "react-router-redux";

import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import type { MeasureId, TemporalUnit } from "metabase-types/api";
import type { MetricId } from "metabase-types/api/metric";

import type { ExpressionToken } from "../types/operators";
import type {
  MetricSourceId,
  MetricsViewerPageState,
  MetricsViewerTabState,
} from "../types/viewer-state";
import { isMetricEntry } from "../types/viewer-state";
import type { SourceFilter } from "../utils/dimension-filters";
import { createSourceId } from "../utils/source-ids";
import {
  type SerializedMetricsViewerPageState,
  decodeState,
  deserializeExpression,
  deserializeTab,
  encodeState,
  stateToSerializedState,
} from "../utils/url-serialization";

export interface BreakoutInfo {
  dimensionId: string;
  temporalUnit?: TemporalUnit;
  binning?: string;
}

export interface LoadSourcesRequest {
  metricIds: MetricId[];
  measureIds: MeasureId[];
  breakoutBySourceId?: Record<MetricSourceId, BreakoutInfo>;
  filtersBySourceId?: Record<MetricSourceId, SourceFilter[]>;
}

export function useViewerUrl(
  state: MetricsViewerPageState,
  initialize: (state: MetricsViewerPageState) => void,
  onLoadSources: (request: LoadSourcesRequest) => void,
  location: Location,
  tokens: ExpressionToken[],
  onTokensRestored: (tokens: ExpressionToken[]) => void,
): void {
  const dispatch = useDispatch();
  const lastHashRef = useRef<string | null>(null);

  // sync URL to state
  useEffect(() => {
    let hash = location.hash.slice(1);
    let serializedState: SerializedMetricsViewerPageState;

    if (!hash) {
      const params = new URLSearchParams(location.search);
      const metricId = params.get("metricId");
      if (metricId) {
        serializedState = {
          sources: [{ type: "metric", id: parseInt(metricId, 10) }],
          tabs: [],
          selectedTabId: null,
          expression: [],
        };
        const encodedHash = encodeState(serializedState);
        if (encodedHash === undefined) {
          return;
        }
        hash = encodedHash;
      } else {
        serializedState = decodeState(hash);
      }
    } else {
      serializedState = decodeState(hash);
    }

    if (hash === lastHashRef.current) {
      return;
    }
    lastHashRef.current = hash;

    const metricIds: MetricId[] = [];
    const measureIds: MeasureId[] = [];
    const breakoutBySourceId: Record<MetricSourceId, BreakoutInfo> = {};
    const filtersBySourceId: Record<MetricSourceId, SourceFilter[]> = {};

    for (const source of serializedState.sources) {
      const sourceId = createSourceId(source.id, source.type);

      if (source.type === "metric") {
        metricIds.push(source.id);
      } else if (source.type === "measure") {
        measureIds.push(source.id);
      }

      if (source.breakout) {
        breakoutBySourceId[sourceId] = {
          dimensionId: source.breakout,
          temporalUnit: source.breakoutTemporalUnit,
          binning: source.breakoutBinning,
        };
      }

      if (source.filters && source.filters.length > 0) {
        filtersBySourceId[sourceId] = source.filters;
      }
    }

    if (serializedState.tabs.length > 0) {
      const tabs: MetricsViewerTabState[] =
        serializedState.tabs.map(deserializeTab);

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

    const restoredExpression = deserializeExpression(
      serializedState.expression ?? [],
    );

    // When there is no saved expression (e.g. legacy URLs, ?metricId= entry point),
    // generate default tokens so every source appears as a pill in the formula input.
    if (restoredExpression.length === 0 && serializedState.sources.length > 0) {
      const defaultTokens: ExpressionToken[] = [];
      for (let i = 0; i < serializedState.sources.length; i++) {
        if (i > 0) {
          defaultTokens.push({ type: "operator", op: "+" });
        }
        defaultTokens.push({ type: "metric", metricIndex: i });
      }
      onTokensRestored(defaultTokens);
    } else {
      onTokensRestored(restoredExpression);
    }
  }, [location, dispatch, initialize, onLoadSources, onTokensRestored]);

  // sync state to URL
  useEffect(() => {
    if (
      state.definitions.length === 0 ||
      state.definitions.some(
        (entry) => isMetricEntry(entry) && entry.definition === null,
      )
    ) {
      return;
    }

    const serializedState = stateToSerializedState(state, tokens);
    const hash = encodeState(serializedState);
    if (hash !== undefined && hash !== lastHashRef.current) {
      lastHashRef.current = hash;
      const url = Urls.metricsViewer(hash);
      if (!window.location.hash) {
        dispatch(replace(url));
      } else {
        dispatch(push(url));
      }
    }
  }, [state, tokens, dispatch]);
}
