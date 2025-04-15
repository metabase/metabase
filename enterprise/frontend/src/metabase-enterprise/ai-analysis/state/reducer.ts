import { type PayloadAction, createSlice } from "@reduxjs/toolkit";

import type { AnalysisResponse } from "../../api/ai-analysis";

export interface AiAnalysisState {
  isExplainSidebarVisible: boolean;
  analysisType: "chart" | "dashboard" | null;
  explanation: string | null;
  metadata: {
    confidence?: number;
    model?: string;
  } | null;
}

export const aiAnalysisInitialState: AiAnalysisState = {
  isExplainSidebarVisible: false,
  analysisType: null,
  explanation: null,
  metadata: null,
};

export const aiAnalysis = createSlice({
  name: "metabase-enterprise/ai-analysis",
  initialState: aiAnalysisInitialState,
  reducers: {
    setExplanation: (
      state,
      action: PayloadAction<{
        type: "chart" | "dashboard";
        response: AnalysisResponse;
      }>,
    ) => {
      state.isExplainSidebarVisible = true;
      state.analysisType = action.payload.type;
      state.explanation = action.payload.response.summary;
      state.metadata = action.payload.response.metadata || null;
    },
    clearExplanation: (state) => {
      state.isExplainSidebarVisible = false;
      state.analysisType = null;
      state.explanation = null;
      state.metadata = null;
    },
  },
});

export const { setExplanation, clearExplanation } = aiAnalysis.actions;
export const aiAnalysisReducer = aiAnalysis.reducer;
