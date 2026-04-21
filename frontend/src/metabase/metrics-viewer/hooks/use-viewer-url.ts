import type { Location } from "history";
import { useEffect, useRef } from "react";
import { push, replace } from "react-router-redux";
import { t } from "ttag";

import { useToast } from "metabase/common/hooks";
import { useDispatch } from "metabase/utils/redux";
import * as Urls from "metabase/utils/urls";
import type { MeasureId } from "metabase-types/api";
import type { MetricId } from "metabase-types/api/metric";

import {
  type MetricsViewerFormulaEntity,
  type MetricsViewerPageState,
  type MetricsViewerTabState,
  isExpressionEntry,
  isMetricEntry,
} from "../types/viewer-state";
import { parseSourceId } from "../utils/source-ids";
import {
  type SerializedMetricsViewerPageState,
  decodeState,
  deserializeFormulaEntities,
  deserializeTab,
  encodeState,
  stateToSerializedState,
} from "../utils/url-serialization";

export interface LoadSourcesRequest {
  metricIds: MetricId[];
  measureIds: MeasureId[];
}

export function useViewerUrl(
  state: MetricsViewerPageState,
  initialize: (state: MetricsViewerPageState) => void,
  onLoadSources: (request: LoadSourcesRequest) => void,
  location: Location,
  setFormulaEntities: (
    entities: MetricsViewerFormulaEntity[],
    slotMapping?: Map<number, number>,
  ) => void,
  setInitialLoadComplete: (initialLoadComplete: boolean) => void,
): void {
  const dispatch = useDispatch();
  const [sendToast] = useToast();
  const lastHashRef = useRef<string | null>(null);

  // sync URL to state
  useEffect(() => {
    try {
      let hash = location.hash.slice(1);
      let serializedState: SerializedMetricsViewerPageState;

      if (!hash) {
        const params = new URLSearchParams(location.search);
        const metricId = params.get("metricId");
        const measureId = params.get("measureId");
        if (metricId || measureId) {
          const entity = metricId
            ? { type: "metric" as const, id: parseInt(metricId, 10) }
            : { type: "measure" as const, id: parseInt(measureId!, 10) };
          serializedState = {
            formulaEntities: [entity],
            tabs: [],
            selectedTabId: null,
          };
          const encodedHash = encodeState(serializedState);
          if (encodedHash === undefined) {
            setInitialLoadComplete(true);
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
        setInitialLoadComplete(true);
        return;
      }
      lastHashRef.current = hash;

      if (serializedState.tabs.length > 0) {
        const tabs: MetricsViewerTabState[] =
          serializedState.tabs.map(deserializeTab);

        initialize({
          definitions: {},
          formulaEntities: [],
          tabs,
          selectedTabId: serializedState.selectedTabId,
        });
      }

      const metricIds: MetricId[] = [];
      const measureIds: MeasureId[] = [];

      const restoredFormulaEntities =
        deserializeFormulaEntities(serializedState);

      restoredFormulaEntities.forEach((entity) => {
        if (isMetricEntry(entity)) {
          const { type, id } = parseSourceId(entity.id);
          if (type === "metric") {
            metricIds.push(id);
          } else if (type === "measure") {
            measureIds.push(id);
          }
        }
        if (isExpressionEntry(entity)) {
          entity.tokens.forEach((token) => {
            if (token.type === "metric") {
              const { type, id } = parseSourceId(token.sourceId);
              if (type === "metric") {
                metricIds.push(id);
              } else if (type === "measure") {
                measureIds.push(id);
              }
            }
          });
        }
      });

      if (metricIds.length > 0 || measureIds.length > 0) {
        onLoadSources({
          metricIds,
          measureIds,
        });
      } else {
        setInitialLoadComplete(true);
      }

      if (restoredFormulaEntities.length > 0) {
        setFormulaEntities(restoredFormulaEntities);
      }
    } catch (error) {
      console.error(error);
      setInitialLoadComplete(true);
      sendToast({
        icon: "warning_triangle_filled",
        iconColor: "warning",
        message: t`There was a problem restoring the page state`,
      });
    }
  }, [
    location,
    dispatch,
    initialize,
    onLoadSources,
    setFormulaEntities,
    setInitialLoadComplete,
    sendToast,
  ]);

  // sync state to URL
  useEffect(() => {
    // don't update URL until state is fully resolved
    // definitions are loaded and there are no outstanding SerializedDefinitionInfos
    const definitionValues = Object.values(state.definitions);
    const hasPendingSerializedInfo = state.formulaEntities.some((entity) => {
      if (isMetricEntry(entity) && entity.serializedDefinitionInfo) {
        return true;
      }
      if (isExpressionEntry(entity)) {
        return entity.tokens.some(
          (token) => token.type === "metric" && token.serializedDefinitionInfo,
        );
      }
      return false;
    });
    if (
      definitionValues.length === 0 ||
      definitionValues.some((entry) => entry.definition === null) ||
      hasPendingSerializedInfo
    ) {
      return;
    }

    const serializedState = stateToSerializedState(state);
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
  }, [state, dispatch]);
}
