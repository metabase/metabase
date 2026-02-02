import { useCallback, useEffect, useRef } from "react";
import { push } from "react-router-redux";

import { useDispatch, useSelector } from "metabase/lib/redux";
import type { TimeseriesDisplayType } from "metabase-types/api";
import type {
  MetricSourceId,
  ProjectionConfig,
} from "metabase-types/store/metrics-explorer";

import {
  addMeasureSource,
  addMetricSource,
  initializeFromUrl,
  removeSource,
  setDimensionOverride,
  setDisplayType,
  setProjectionConfig,
} from "../metrics-explorer.slice";
import {
  selectDefaultProjectionConfig,
  selectDimensionOverrides,
  selectProjectionConfig,
  selectSourceDataById,
  selectSourceOrder,
  selectUrlState,
} from "../selectors";
import {
  fetchAllResults,
  fetchMeasureSource,
  fetchMetricSource,
} from "../thunks";
import { serializedSourceToId } from "../utils/source-ids";
import {
  buildUrl,
  decodeState,
  serializedStateToReduxState,
} from "../utils/url";

/**
 * Hook that synchronizes URL state with Redux state.
 * Two-way sync:
 * 1. URL -> Redux: On mount/URL change, parse URL and update Redux
 * 2. Redux -> URL: On state change, update URL
 */
export function useUrlSync(hash: string): void {
  const dispatch = useDispatch();
  const lastHashRef = useRef<string | null>(null);
  const isInitializedRef = useRef(false);

  const urlState = useSelector(selectUrlState);
  const sourceOrder = useSelector(selectSourceOrder);
  const sourceDataById = useSelector(selectSourceDataById);
  const projectionConfig = useSelector(selectProjectionConfig);
  const dimensionOverrides = useSelector(selectDimensionOverrides);
  const defaultProjectionConfig = useSelector(selectDefaultProjectionConfig);

  // Track which sources have had fetch initiated to avoid double-fetching
  const fetchedSourcesRef = useRef<Set<MetricSourceId>>(new Set());

  // URL -> Redux: Initialize from URL on mount and when hash changes
  useEffect(() => {
    // Skip if hash hasn't changed (prevents infinite loops)
    // Use null as initial value to distinguish "not initialized" from "empty hash"
    if (lastHashRef.current !== null && hash === lastHashRef.current) {
      return;
    }
    lastHashRef.current = hash;

    const serializedState = decodeState(hash);
    const {
      sourceOrder: newSourceOrder,
      projectionConfig: newProjectionConfig,
      dimensionOverrides: newDimensionOverrides,
      displayType,
      serializedSources,
    } = serializedStateToReduxState(serializedState);

    // Update Redux state
    dispatch(
      initializeFromUrl({
        sourceOrder: newSourceOrder,
        projectionConfig: newProjectionConfig,
        dimensionOverrides: newDimensionOverrides,
        displayType,
      }),
    );

    // Fetch metadata for sources that haven't been fetched yet
    for (const serializedSource of serializedSources) {
      const sourceId = serializedSourceToId(serializedSource);

      // Only fetch if we haven't already initiated a fetch for this source
      if (!fetchedSourcesRef.current.has(sourceId)) {
        fetchedSourcesRef.current.add(sourceId);
        if (serializedSource.type === "metric") {
          dispatch(fetchMetricSource({ cardId: serializedSource.id }));
        } else {
          dispatch(
            fetchMeasureSource({
              measureId: serializedSource.id,
            }),
          );
        }
      }
    }

    isInitializedRef.current = true;
  }, [hash, dispatch]);

  // Redux -> URL: Update URL when state changes
  useEffect(() => {
    if (!isInitializedRef.current) {
      return;
    }

    const newUrl = buildUrl(urlState);
    const newHash = newUrl.includes("#") ? `#${newUrl.split("#")[1]}` : "";

    // Only push if URL actually changed
    if (newHash !== lastHashRef.current) {
      lastHashRef.current = newHash;
      dispatch(push(newUrl));
    }
  }, [urlState, dispatch]);

  // Initialize projection config when first source metadata is loaded
  useEffect(() => {
    if (
      sourceOrder.length > 0 &&
      !projectionConfig &&
      defaultProjectionConfig
    ) {
      dispatch(setProjectionConfig({ config: defaultProjectionConfig }));
    }
  }, [sourceOrder.length, projectionConfig, defaultProjectionConfig, dispatch]);

  // Fetch results when projection config or dimension overrides change, or when source data loads
  const loadedSourceCount = Object.keys(sourceDataById).length;

  useEffect(() => {
    if (projectionConfig && loadedSourceCount > 0) {
      dispatch(fetchAllResults());
    }
  }, [projectionConfig, dimensionOverrides, loadedSourceCount, dispatch]);
}

/**
 * Hook that provides actions for modifying explorer state.
 * These actions will trigger URL updates via useUrlSync.
 */
export function useExplorerActions() {
  const dispatch = useDispatch();

  const handleAddMetric = useCallback(
    (cardId: number) => {
      dispatch(addMetricSource({ cardId }));
      dispatch(fetchMetricSource({ cardId }));
    },
    [dispatch],
  );

  const handleAddMeasure = useCallback(
    (measureId: number, tableId: number) => {
      dispatch(addMeasureSource({ measureId, tableId }));
      dispatch(fetchMeasureSource({ measureId }));
    },
    [dispatch],
  );

  const handleRemoveSource = useCallback(
    (sourceId: MetricSourceId) => {
      dispatch(removeSource({ sourceId }));
    },
    [dispatch],
  );

  const handleSetProjectionConfig = useCallback(
    (config: ProjectionConfig) => {
      dispatch(setProjectionConfig({ config }));
    },
    [dispatch],
  );

  const handleSetDimensionOverride = useCallback(
    (sourceId: MetricSourceId, columnName: string) => {
      dispatch(setDimensionOverride({ sourceId, columnName }));
    },
    [dispatch],
  );

  const handleSetDisplayType = useCallback(
    (displayType: TimeseriesDisplayType) => {
      dispatch(setDisplayType(displayType));
    },
    [dispatch],
  );

  return {
    addMetric: handleAddMetric,
    addMeasure: handleAddMeasure,
    removeSource: handleRemoveSource,
    setProjectionConfig: handleSetProjectionConfig,
    setDimensionOverride: handleSetDimensionOverride,
    setDisplayType: handleSetDisplayType,
  };
}
