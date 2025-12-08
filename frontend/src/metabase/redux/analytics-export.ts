import { createSlice } from "@reduxjs/toolkit";
import { t } from "ttag";

import { analyticsApi } from "metabase/api";
import type { AnalyticsExportState, State } from "metabase-types/store";

export const getAnalyticsExport = (state: State): AnalyticsExportState =>
  state.analyticsExport;

export const hasActiveExport = (state: State) =>
  getAnalyticsExport(state).status === "in-progress";

const initialState: AnalyticsExportState = {};

const analyticsExportSlice = createSlice({
  name: "metabase/analytics",
  initialState,
  reducers: {
    clearExport: () => initialState,
  },
  extraReducers: (builder) => {
    builder
      .addMatcher(analyticsApi.endpoints.exportAnalytics.matchPending, () => ({
        status: "in-progress" as const,
      }))
      .addMatcher(
        analyticsApi.endpoints.exportAnalytics.matchFulfilled,
        () => ({
          status: "complete" as const,
        }),
      )
      .addMatcher(
        analyticsApi.endpoints.exportAnalytics.matchRejected,
        (state, action) => ({
          status: "error" as const,
          message: action.error.message ?? t`Failed to export analytics`,
        }),
      );
  },
});

export const { clearExport } = analyticsExportSlice.actions;

export const reducer = analyticsExportSlice.reducer;
