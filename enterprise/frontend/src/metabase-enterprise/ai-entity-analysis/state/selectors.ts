import { createSelector } from "@reduxjs/toolkit";

import type { AiAnalysisState } from "./reducer";

export type AiAnalysisStoreState = {
  plugins: {
    aiAnalysisPlugin: AiAnalysisState;
  };
};

export const getAiAnalysis = (state: AiAnalysisStoreState) =>
  state.plugins.aiAnalysisPlugin;

export const getIsExplainSidebarVisible = createSelector(
  [getAiAnalysis],
  (aiAnalysis) => aiAnalysis.isExplainSidebarVisible,
);
