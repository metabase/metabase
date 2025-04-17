import { createSlice } from "@reduxjs/toolkit";

export interface AiAnalysisState {
  isAIQuestionAnalysisSidebarVisible: boolean;
}

export const aiAnalysisInitialState: AiAnalysisState = {
  isAIQuestionAnalysisSidebarVisible: false,
};

export const aiAnalysis = createSlice({
  name: "metabase-enterprise/ai-analysis",
  initialState: aiAnalysisInitialState,
  reducers: {
    openAIQuestionAnalysisSidebar: (state) => {
      state.isAIQuestionAnalysisSidebarVisible = true;
    },
    closeAIQuestionAnalysisSidebar: (state) => {
      state.isAIQuestionAnalysisSidebarVisible = false;
    },
    toggleAIQuestionAnalysisSidebar: (state) => {
      state.isAIQuestionAnalysisSidebarVisible =
        !state.isAIQuestionAnalysisSidebarVisible;
    },
  },
});

export const {
  openAIQuestionAnalysisSidebar,
  closeAIQuestionAnalysisSidebar,
  toggleAIQuestionAnalysisSidebar,
} = aiAnalysis.actions;
export const aiAnalysisReducer = aiAnalysis.reducer;
