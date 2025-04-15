import { createSlice } from "@reduxjs/toolkit";

export interface AiAnalysisState {
  isExplainSidebarVisible: boolean;
}

export const aiAnalysisInitialState: AiAnalysisState = {
  isExplainSidebarVisible: false,
};

export const aiAnalysis = createSlice({
  name: "metabase-enterprise/ai-analysis",
  initialState: aiAnalysisInitialState,
  reducers: {
    openExplainSidebar: (state) => {
      state.isExplainSidebarVisible = true;
    },
    closeExplainSidebar: (state) => {
      state.isExplainSidebarVisible = false;
    },
    toggleExplainSidebar: (state) => {
      state.isExplainSidebarVisible = !state.isExplainSidebarVisible;
    },
  },
});

export const { openExplainSidebar, closeExplainSidebar, toggleExplainSidebar } =
  aiAnalysis.actions;
export const aiAnalysisReducer = aiAnalysis.reducer;
