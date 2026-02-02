import type { PayloadAction } from "@reduxjs/toolkit";
import { createSlice } from "@reduxjs/toolkit";

import type { TimeseriesDisplayType } from "metabase-types/api";
import type {
  AddMeasureSourcePayload,
  AddMetricSourcePayload,
  ClearDimensionOverridePayload,
  InitializeFromUrlPayload,
  MetricsExplorerState,
  RemoveSourcePayload,
  ReorderSourcesPayload,
  SetDimensionOverridePayload,
  SetProjectionConfigPayload,
} from "metabase-types/store/metrics-explorer";

import {
  fetchMeasureSource,
  fetchMetricSource,
  fetchSourceResult,
} from "./thunks";
import { createMeasureSourceId, createMetricSourceId } from "./utils";

function getInitialState(): MetricsExplorerState {
  return {
    // Core state (persisted to URL)
    sourceOrder: [],
    projectionConfig: null,
    dimensionOverrides: {},
    displayType: "line",

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
      const { sourceOrder, projectionConfig, dimensionOverrides, displayType } =
        action.payload;
      state.sourceOrder = sourceOrder;
      state.projectionConfig = projectionConfig;
      state.dimensionOverrides = dimensionOverrides;
      state.displayType = displayType;
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
    addMetricSource: (
      state,
      action: PayloadAction<AddMetricSourcePayload>,
    ) => {
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

      // Clear projection config if no sources left
      if (state.sourceOrder.length === 0) {
        state.projectionConfig = null;
        state.displayType = "line";
      }
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
     * Set the display type (line/area/bar).
     */
    setDisplayType: (state, action: PayloadAction<TimeseriesDisplayType>) => {
      state.displayType = action.payload;
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
  reorderSources,
  setProjectionConfig,
  setDimensionOverride,
  clearDimensionOverride,
  setDisplayType,
  setError,
  reset,
} = metricsExplorerSlice.actions;

export const reducer = metricsExplorerSlice.reducer;
