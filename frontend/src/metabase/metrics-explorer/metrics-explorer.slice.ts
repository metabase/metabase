import type { PayloadAction } from "@reduxjs/toolkit";
import { createSlice } from "@reduxjs/toolkit";

import type {
  AddMeasureSourcePayload,
  AddMetricSourcePayload,
  ClearDimensionOverridePayload,
  InitializeFromUrlPayload,
  MetricSourceId,
  MetricsExplorerDisplayType,
  MetricsExplorerState,
  RemoveSourcePayload,
  ReorderSourcesPayload,
  SetBinningPayload,
  SetDimensionOverridePayload,
  SetProjectionConfigPayload,
  StoredDimensionTab,
  SwapSourcePayload,
} from "metabase-types/store/metrics-explorer";

import {
  fetchMeasureSource,
  fetchMetricSource,
  fetchSourceResult,
} from "./thunks";
import { createMeasureSourceId, createMetricSourceId } from "./utils";
import { ALL_TAB_ID, getTabConfig } from "./utils/tab-registry";

function getInitialState(): MetricsExplorerState {
  return {
    // Core state (persisted to URL)
    sourceOrder: [],
    projectionConfig: null,
    dimensionOverrides: {},
    displayType: "line",
    activeTabId: "time",
    dimensionTabs: [],
    binningByTab: {},

    // Data cache (not persisted)
    sourceDataById: {},
    resultsById: {},

    // Loading/error states
    loadingSourceIds: {},
    loadingResultIds: {},
    error: null,
  };
}

const metricsExplorerSlice = createSlice({
  name: "metricsExplorer",
  initialState: getInitialState(),
  reducers: {
    /**
     * Initialize state from URL-parsed values.
     */
    initializeFromUrl: (
      state,
      action: PayloadAction<InitializeFromUrlPayload>,
    ) => {
      const {
        sourceOrder,
        projectionConfig,
        dimensionOverrides,
        displayType,
        activeTabId,
        dimensionTabs,
        binningByTab,
      } = action.payload;
      state.sourceOrder = sourceOrder;
      state.projectionConfig = projectionConfig;
      state.dimensionOverrides = dimensionOverrides;
      state.displayType = displayType;
      state.activeTabId = activeTabId;
      state.dimensionTabs = dimensionTabs;
      state.binningByTab = binningByTab;
      // Clear any stale data for sources not in the new order
      const sourceSet = new Set(sourceOrder);
      for (const sourceId of Object.keys(state.sourceDataById)) {
        if (!sourceSet.has(sourceId as keyof typeof state.sourceDataById)) {
          delete state.sourceDataById[
            sourceId as keyof typeof state.sourceDataById
          ];
          delete state.resultsById[sourceId as keyof typeof state.resultsById];
        }
      }
    },

    /**
     * Add a metric source to the order.
     */
    addMetricSource: (state, action: PayloadAction<AddMetricSourcePayload>) => {
      const sourceId = createMetricSourceId(action.payload.cardId);
      if (!state.sourceOrder.includes(sourceId)) {
        state.sourceOrder.push(sourceId);
      }
    },

    /**
     * Add a measure source to the order.
     */
    addMeasureSource: (
      state,
      action: PayloadAction<AddMeasureSourcePayload>,
    ) => {
      const sourceId = createMeasureSourceId(action.payload.measureId);
      if (!state.sourceOrder.includes(sourceId)) {
        state.sourceOrder.push(sourceId);
      }
    },

    /**
     * Remove a source from the explorer.
     */
    removeSource: (state, action: PayloadAction<RemoveSourcePayload>) => {
      const { sourceId } = action.payload;
      state.sourceOrder = state.sourceOrder.filter((id) => id !== sourceId);
      delete state.sourceDataById[sourceId];
      delete state.resultsById[sourceId];
      delete state.dimensionOverrides[sourceId];
      delete state.loadingSourceIds[sourceId];
      delete state.loadingResultIds[sourceId];

      // Clean up tab column mappings for removed source
      for (const tab of state.dimensionTabs) {
        delete tab.columnsBySource[sourceId];
      }
      // Remove tabs that have no columns left
      state.dimensionTabs = state.dimensionTabs.filter(
        (tab) => Object.keys(tab.columnsBySource).length > 0,
      );

      // Clear state if no sources left
      if (state.sourceOrder.length === 0) {
        state.projectionConfig = null;
        state.displayType = "line";
        state.activeTabId = "time";
        state.dimensionTabs = [];
      }

      // Switch active tab if it was removed
      if (!state.dimensionTabs.some((tab) => tab.id === state.activeTabId)) {
        state.activeTabId = state.dimensionTabs[0]?.id ?? "time";
      }
    },

    /**
     * Swap a source in place, preserving its position in the order.
     */
    swapSourceInPlace: (state, action: PayloadAction<SwapSourcePayload>) => {
      const { oldSourceId, newSourceId } = action.payload;
      const index = state.sourceOrder.indexOf(oldSourceId);
      if (index === -1) {
        return;
      }

      state.sourceOrder[index] = newSourceId;

      delete state.sourceDataById[oldSourceId];
      delete state.resultsById[oldSourceId];
      delete state.dimensionOverrides[oldSourceId];
      delete state.loadingSourceIds[oldSourceId];
      delete state.loadingResultIds[oldSourceId];

      for (const tab of state.dimensionTabs) {
        delete tab.columnsBySource[oldSourceId];
      }
      state.dimensionTabs = state.dimensionTabs.filter(
        (tab) => Object.keys(tab.columnsBySource).length > 0,
      );
    },

    /**
     * Reorder sources (for drag-and-drop).
     */
    reorderSources: (state, action: PayloadAction<ReorderSourcesPayload>) => {
      state.sourceOrder = action.payload.sourceIds;
    },

    /**
     * Set the projection config (temporal unit + date filter).
     */
    setProjectionConfig: (
      state,
      action: PayloadAction<SetProjectionConfigPayload>,
    ) => {
      state.projectionConfig = action.payload.config;
    },

    /**
     * Set a dimension override for a specific source.
     */
    setDimensionOverride: (
      state,
      action: PayloadAction<SetDimensionOverridePayload>,
    ) => {
      const { sourceId, columnName } = action.payload;
      state.dimensionOverrides[sourceId] = columnName;
    },

    /**
     * Clear dimension override for a specific source.
     */
    clearDimensionOverride: (
      state,
      action: PayloadAction<ClearDimensionOverridePayload>,
    ) => {
      delete state.dimensionOverrides[action.payload.sourceId];
    },

    /**
     * Set the display type (line/area/bar/map/row).
     */
    setDisplayType: (
      state,
      action: PayloadAction<MetricsExplorerDisplayType>,
    ) => {
      state.displayType = action.payload;
    },

    /**
     * Set the active dimension tab and update display type and projection config.
     */
    setActiveTab: (state, action: PayloadAction<{ tabId: string }>) => {
      const { tabId } = action.payload;

      if (state.activeTabId !== ALL_TAB_ID) {
        const currentTab = state.dimensionTabs.find(
          (t) => t.id === state.activeTabId,
        );
        if (currentTab && state.projectionConfig) {
          currentTab.projectionConfig = state.projectionConfig;
          currentTab.displayType = state.displayType;
        }
      }

      state.activeTabId = tabId;
      state.dimensionOverrides = {};

      if (tabId !== ALL_TAB_ID) {
        const targetTab = state.dimensionTabs.find((t) => t.id === tabId);
        if (targetTab) {
          const tabConfig = getTabConfig(targetTab.type);
          state.displayType =
            targetTab.displayType ?? tabConfig.defaultDisplayType;
          state.projectionConfig =
            targetTab.projectionConfig ?? tabConfig.defaultProjectionConfig();
        }
      }
    },

    /**
     * Set the initial dimension tabs (called when first source data loads).
     */
    setInitialTabs: (state, action: PayloadAction<StoredDimensionTab[]>) => {
      if (state.dimensionTabs.length === 0) {
        state.dimensionTabs = action.payload;
        if (action.payload.length > 0 && state.activeTabId === "time") {
          state.activeTabId = action.payload[0].id;
        }
      }
    },

    /**
     * Add a new dimension tab.
     */
    addTab: (state, action: PayloadAction<StoredDimensionTab>) => {
      const tab = action.payload;
      if (!state.dimensionTabs.some((t) => t.id === tab.id)) {
        state.dimensionTabs.push(tab);
      }
    },

    /**
     * Remove a dimension tab by ID.
     */
    removeTab: (state, action: PayloadAction<string>) => {
      const tabId = action.payload;
      state.dimensionTabs = state.dimensionTabs.filter((t) => t.id !== tabId);

      // Switch active tab if the removed tab was active
      if (state.activeTabId === tabId) {
        state.activeTabId = state.dimensionTabs[0]?.id ?? "time";
      }
    },

    /**
     * Update column mappings for a tab when a source is added.
     */
    updateTabColumns: (
      state,
      action: PayloadAction<{
        tabId: string;
        sourceId: MetricSourceId;
        columnName: string;
        label?: string;
      }>,
    ) => {
      const { tabId, sourceId, columnName, label } = action.payload;
      const tab = state.dimensionTabs.find((t) => t.id === tabId);
      if (tab) {
        tab.columnsBySource[sourceId] = columnName;
        if (label) {
          tab.label = label;
        }
      }
    },

    /**
     * Set binning strategy for a tab.
     */
    setBinning: (state, action: PayloadAction<SetBinningPayload>) => {
      const { tabId, binningStrategy } = action.payload;
      if (binningStrategy === null) {
        delete state.binningByTab[tabId];
      } else {
        state.binningByTab[tabId] = binningStrategy;
      }
    },

    /**
     * Set error state.
     */
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },

    /**
     * Reset the entire state.
     */
    reset: () => getInitialState(),
  },
  extraReducers: (builder) => {
    builder
      // fetchMetricSource
      .addCase(fetchMetricSource.pending, (state, action) => {
        const sourceId = createMetricSourceId(action.meta.arg.cardId);
        state.loadingSourceIds[sourceId] = true;
        state.error = null;
      })
      .addCase(fetchMetricSource.fulfilled, (state, action) => {
        const sourceId = createMetricSourceId(action.meta.arg.cardId);
        delete state.loadingSourceIds[sourceId];
        if (action.payload) {
          // `any` prevents the "Type instantiation is excessively deep" error
          // caused by Immer's WritableDraft with complex union types
          state.sourceDataById[sourceId] = {
            type: "metric",
            data: action.payload,
          } as any;
        }
      })
      .addCase(fetchMetricSource.rejected, (state, action) => {
        const sourceId = createMetricSourceId(action.meta.arg.cardId);
        delete state.loadingSourceIds[sourceId];
        state.error = action.error.message || "Failed to fetch metric";
      })

      // fetchMeasureSource
      .addCase(fetchMeasureSource.pending, (state, action) => {
        const sourceId = createMeasureSourceId(action.meta.arg.measureId);
        state.loadingSourceIds[sourceId] = true;
        state.error = null;
      })
      .addCase(fetchMeasureSource.fulfilled, (state, action) => {
        const sourceId = createMeasureSourceId(action.meta.arg.measureId);
        delete state.loadingSourceIds[sourceId];
        if (action.payload) {
          // `any` prevents the "Type instantiation is excessively deep" error
          // Get tableId from the measure data itself
          state.sourceDataById[sourceId] = {
            type: "measure",
            data: action.payload,
            tableId: action.payload.measure.table_id,
          } as any;
        }
      })
      .addCase(fetchMeasureSource.rejected, (state, action) => {
        const sourceId = createMeasureSourceId(action.meta.arg.measureId);
        delete state.loadingSourceIds[sourceId];
        state.error = action.error.message || "Failed to fetch measure";
      })

      // fetchSourceResult
      .addCase(fetchSourceResult.pending, (state, action) => {
        const sourceId = action.meta.arg.sourceId;
        state.loadingResultIds[sourceId] = true;
      })
      .addCase(fetchSourceResult.fulfilled, (state, action) => {
        const sourceId = action.meta.arg.sourceId;
        delete state.loadingResultIds[sourceId];
        if (action.payload) {
          // `any` prevents the "Type instantiation is excessively deep" error
          state.resultsById[sourceId] = action.payload as any;
        }
      })
      .addCase(fetchSourceResult.rejected, (state, action) => {
        const sourceId = action.meta.arg.sourceId;
        delete state.loadingResultIds[sourceId];
        // Only set error for unexpected failures, not expected ones during initialization
        // "Request aborted" - user changed config, previous request cancelled
        // "Failed to build query" - source metadata not loaded yet, will retry when it loads
        if (
          action.payload &&
          action.payload.error !== "Request aborted" &&
          action.payload.error !== "Failed to build query"
        ) {
          state.error = action.payload.error;
        }
      });
  },
});

export const {
  initializeFromUrl,
  addMetricSource,
  addMeasureSource,
  removeSource,
  swapSourceInPlace,
  reorderSources,
  setProjectionConfig,
  setDimensionOverride,
  clearDimensionOverride,
  setDisplayType,
  setActiveTab,
  setInitialTabs,
  addTab,
  removeTab,
  updateTabColumns,
  setBinning,
  setError,
  reset,
} = metricsExplorerSlice.actions;

export const reducer = metricsExplorerSlice.reducer;
