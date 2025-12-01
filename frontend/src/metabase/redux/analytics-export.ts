import { createSlice } from "@reduxjs/toolkit";
import { t } from "ttag";

import { openSaveDialog } from "metabase/lib/dom";
import { createAsyncThunk } from "metabase/lib/redux";
import type { AnalyticsExportState, State } from "metabase-types/store";

export const getAnalyticsExport = (state: State): AnalyticsExportState =>
  state.analyticsExport;

export const hasActiveExport = (state: State) =>
  getAnalyticsExport(state).status === "in-progress";

export const exportAnalytics = createAsyncThunk(
  "metabase/analytics/exportAnalytics",
  async () => {
    const response = await fetch("/api/ee/audit-app/analytics-dev/export", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error("Export failed");
    }

    const contentDisposition = response.headers.get("Content-Disposition");
    const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
    const filename = filenameMatch?.[1] || "analytics-export.tar.gz";

    const fileContent = await response.blob();
    openSaveDialog(filename, fileContent);

    return { filename };
  },
);

const initialState: AnalyticsExportState = {};

const analyticsExportSlice = createSlice({
  name: "metabase/analytics",
  initialState,
  reducers: {
    clearExport: () => initialState,
  },
  extraReducers: (builder) => {
    builder
      .addCase(exportAnalytics.pending, () => ({
        status: "in-progress" as const,
      }))
      .addCase(exportAnalytics.fulfilled, () => ({
        status: "complete" as const,
      }))
      .addCase(exportAnalytics.rejected, (state, action) => ({
        status: "error" as const,
        message: action.error.message ?? t`Failed to export analytics`,
      }));
  },
});

export const { clearExport } = analyticsExportSlice.actions;

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default analyticsExportSlice.reducer;
