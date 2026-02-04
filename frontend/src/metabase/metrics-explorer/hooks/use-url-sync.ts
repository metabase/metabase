import { useCallback, useEffect, useRef } from "react";
import { push, replace } from "react-router-redux";

import { useDispatch, useSelector } from "metabase/lib/redux";
import type {
  MetricSourceId,
  MetricsExplorerDisplayType,
  ProjectionConfig,
  SerializedExplorerState,
  SerializedSource,
} from "metabase-types/store/metrics-explorer";

import {
  addTab,
  initializeFromUrl,
  removeSource,
  removeTab,
  setActiveTab,
  setBinning,
  setDimensionOverride,
  setDisplayType,
  setProjectionConfig,
} from "../metrics-explorer.slice";
import {
  selectActiveTabId,
  selectBaseQueries,
  selectDefaultProjectionConfig,
  selectDimensionOverrides,
  selectProjectionConfig,
  selectSourceDataById,
  selectSourceOrder,
  selectStoredDimensionTabs,
  selectUrlState,
} from "../selectors";
import {
  addMeasureAndFetch,
  addMetricAndFetch,
  fetchAllResults,
  fetchMeasureSource,
  fetchMetricSource,
  swapSource,
  updateTabsForSource,
} from "../thunks";
import { createTabFromColumn } from "../utils/dimensions";
import {
  createMeasureSourceId,
  createMetricSourceId,
  serializedSourceToId,
} from "../utils/source-ids";
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
 *
 * Also handles query param `?metricId=X` by converting to hash state.
 */
export function useUrlSync(hash: string, search: string): void {
  const dispatch = useDispatch();
  const lastHashRef = useRef<string | null>(null);
  const lastSearchRef = useRef<string | null>(null);
  const isInitializedRef = useRef(false);

  const urlState = useSelector(selectUrlState);
  const sourceOrder = useSelector(selectSourceOrder);
  const sourceDataById = useSelector(selectSourceDataById);
  const projectionConfig = useSelector(selectProjectionConfig);
  const dimensionOverrides = useSelector(selectDimensionOverrides);
  const defaultProjectionConfig = useSelector(selectDefaultProjectionConfig);
  const activeTabId = useSelector(selectActiveTabId);
  const baseQueries = useSelector(selectBaseQueries);
  const storedDimensionTabs = useSelector(selectStoredDimensionTabs);

  // Track which sources have had fetch initiated to avoid double-fetching
  const fetchedSourcesRef = useRef<Set<MetricSourceId>>(new Set());

  // Handle query param to hash conversion
  useEffect(() => {
    if (hash || search === lastSearchRef.current) {
      return;
    }
    lastSearchRef.current = search;

    const params = new URLSearchParams(search);
    const metricId = params.get("metricId");

    if (metricId) {
      isInitializedRef.current = false;
      lastHashRef.current = null;

      const sources: SerializedSource[] = [
        { type: "metric", id: parseInt(metricId, 10) },
      ];

      const initialState: SerializedExplorerState = { sources };
      const newUrl = buildUrl(initialState);

      dispatch(replace(newUrl));
    }
  }, [search, hash, dispatch]);

  // URL -> Redux: Initialize from URL on mount and when hash changes
  useEffect(() => {
    // Skip if there's a metricId query param - let the query param effect handle it
    const params = new URLSearchParams(search);
    if (!hash && params.has("metricId")) {
      return;
    }

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
      activeTabId,
      dimensionTabs,
      binningByTab,
      serializedSources,
    } = serializedStateToReduxState(serializedState);

    // Update Redux state
    dispatch(
      initializeFromUrl({
        sourceOrder: newSourceOrder,
        projectionConfig: newProjectionConfig,
        dimensionOverrides: newDimensionOverrides,
        displayType,
        activeTabId,
        dimensionTabs,
        binningByTab,
      }),
    );

    // Fetch metadata for sources that haven't been fetched yet
    for (const serializedSource of serializedSources) {
      const sourceId = serializedSourceToId(serializedSource);

      if (!fetchedSourcesRef.current.has(sourceId)) {
        fetchedSourcesRef.current.add(sourceId);
        if (serializedSource.type === "metric") {
          dispatch(fetchMetricSource({ cardId: serializedSource.id }));
        } else {
          dispatch(fetchMeasureSource({ measureId: serializedSource.id }));
        }
      }
    }

    isInitializedRef.current = true;
  }, [hash, search, dispatch]);

  // Update tabs when source queries become available (handles metadata load delay)
  useEffect(() => {
    for (const sourceId of sourceOrder) {
      const query = baseQueries[sourceId];
      if (!query) {
        continue;
      }

      // Check if this source is already in any tab
      const isInAnyTab = storedDimensionTabs.some(
        (tab) => tab.columnsBySource[sourceId],
      );

      // If source has a query but isn't in tabs yet, update tabs
      if (!isInAnyTab) {
        dispatch(updateTabsForSource(sourceId));
      }
    }
  }, [baseQueries, sourceOrder, storedDimensionTabs, dispatch]);

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

  // Fetch results when projection config, dimension overrides, or active tab change, or when source data loads
  const loadedSourceCount = Object.keys(sourceDataById).length;

  useEffect(() => {
    if (projectionConfig && loadedSourceCount > 0) {
      dispatch(fetchAllResults());
    }
  }, [projectionConfig, dimensionOverrides, activeTabId, loadedSourceCount, dispatch]);
}

/**
 * Hook that provides actions for modifying explorer state.
 * These actions will trigger URL updates via useUrlSync.
 */
export function useExplorerActions() {
  const dispatch = useDispatch();
  const baseQueries = useSelector(selectBaseQueries);
  const sourceOrder = useSelector(selectSourceOrder);

  const handleAddMetric = useCallback(
    (cardId: number) => {
      dispatch(addMetricAndFetch(cardId));
    },
    [dispatch],
  );

  const handleAddMeasure = useCallback(
    (measureId: number) => {
      dispatch(addMeasureAndFetch(measureId));
    },
    [dispatch],
  );

  const handleSwapSource = useCallback(
    (
      oldId: number,
      oldType: "metric" | "measure",
      newId: number,
      newType: "metric" | "measure",
    ) => {
      const oldSourceId =
        oldType === "metric"
          ? createMetricSourceId(oldId)
          : createMeasureSourceId(oldId);

      const newSource =
        newType === "metric"
          ? { type: "metric" as const, cardId: newId }
          : { type: "measure" as const, measureId: newId };

      dispatch(swapSource(oldSourceId, newSource));
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
    (displayType: MetricsExplorerDisplayType) => {
      dispatch(setDisplayType(displayType));
    },
    [dispatch],
  );

  const handleSetActiveTab = useCallback(
    (
      tabId: string,
      defaultDisplayType: MetricsExplorerDisplayType,
      defaultProjectionConfig: ProjectionConfig,
    ) => {
      dispatch(setActiveTab({ tabId, defaultDisplayType, defaultProjectionConfig }));
    },
    [dispatch],
  );

  const handleAddTab = useCallback(
    (
      columnName: string,
      defaultDisplayType: MetricsExplorerDisplayType,
      defaultProjectionConfig: ProjectionConfig,
    ) => {
      const tab = createTabFromColumn(columnName, baseQueries, sourceOrder);
      if (tab) {
        dispatch(addTab(tab));
        dispatch(
          setActiveTab({
            tabId: tab.id,
            defaultDisplayType,
            defaultProjectionConfig,
          }),
        );
      }
    },
    [dispatch, baseQueries, sourceOrder],
  );

  const handleRemoveTab = useCallback(
    (tabId: string) => {
      dispatch(removeTab(tabId));
    },
    [dispatch],
  );

  const handleSetBinning = useCallback(
    (tabId: string, binningStrategy: string | null) => {
      dispatch(setBinning({ tabId, binningStrategy }));
    },
    [dispatch],
  );

  return {
    addMetric: handleAddMetric,
    addMeasure: handleAddMeasure,
    swapSource: handleSwapSource,
    removeSource: handleRemoveSource,
    setProjectionConfig: handleSetProjectionConfig,
    setDimensionOverride: handleSetDimensionOverride,
    setDisplayType: handleSetDisplayType,
    setActiveTab: handleSetActiveTab,
    addTab: handleAddTab,
    removeTab: handleRemoveTab,
    setBinning: handleSetBinning,
  };
}
