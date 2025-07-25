import { type PayloadAction, createSlice } from "@reduxjs/toolkit";

import type {
  Card,
  CardDisplayType,
  DatasetQuery,
  VisualizationSettings,
} from "metabase-types/api";

export interface QuestionEmbed {
  id: number;
  name?: string;
  snapshotId?: number;
}

export interface ReportsState {
  selectedEmbedIndex: number | null; // Index in questionEmbeds array
  isSidebarOpen: boolean;
  // Draft state for currently editing embed
  draftCard: Card | null;
  questionEmbeds: QuestionEmbed[];
}

const initialState: ReportsState = {
  selectedEmbedIndex: null,
  isSidebarOpen: false,
  draftCard: null,
  questionEmbeds: [],
};

const reportsSlice = createSlice({
  name: "reports",
  initialState,
  reducers: {
    openVizSettingsSidebar: (
      state,
      action: PayloadAction<{ embedIndex: number; card: Card<DatasetQuery> }>,
    ) => {
      state.selectedEmbedIndex = action.payload.embedIndex;
      state.isSidebarOpen = true;
      state.draftCard = { ...action.payload.card };
    },
    toggleSidebar: (state) => {
      state.isSidebarOpen = !state.isSidebarOpen;
    },
    setSidebarOpen: (state, action: PayloadAction<boolean>) => {
      state.isSidebarOpen = action.payload;
    },
    updateVizSettings: (
      state,
      action: PayloadAction<{
        settings: VisualizationSettings;
      }>,
    ) => {
      const { settings } = action.payload;
      if (state.draftCard) {
        state.draftCard.visualization_settings = {
          ...state.draftCard.visualization_settings,
          ...settings,
        };
      }
    },
    updateVisualizationType: (
      state,
      action: PayloadAction<{ display: CardDisplayType }>,
    ) => {
      const { display } = action.payload;
      if (state.draftCard) {
        state.draftCard.display = display;
      }
    },
    clearDraftState: (state) => {
      state.draftCard = null;
      state.selectedEmbedIndex = null;
    },
    closeSidebar: (state) => {
      state.isSidebarOpen = false;
      state.selectedEmbedIndex = null;
      state.draftCard = null;
    },
    setQuestionEmbeds: (state, action: PayloadAction<QuestionEmbed[]>) => {
      state.questionEmbeds = action.payload;
    },
    updateQuestionEmbed: (
      state,
      action: PayloadAction<{ embedIndex: number; snapshotId: number }>,
    ) => {
      const { embedIndex, snapshotId } = action.payload;
      if (state.questionEmbeds[embedIndex]) {
        state.questionEmbeds[embedIndex] = {
          ...state.questionEmbeds[embedIndex],
          snapshotId,
        };
      }
    },
    updateQuestionEmbeds: (
      state,
      action: PayloadAction<Array<{ embedIndex: number; snapshotId: number }>>,
    ) => {
      action.payload.forEach(({ embedIndex, snapshotId }) => {
        if (state.questionEmbeds[embedIndex]) {
          state.questionEmbeds[embedIndex] = {
            ...state.questionEmbeds[embedIndex],
            snapshotId,
          };
        }
      });
    },
    resetReports: () => initialState,
  },
});

export const {
  openVizSettingsSidebar,
  toggleSidebar,
  setSidebarOpen,
  updateVizSettings,
  updateVisualizationType,
  clearDraftState,
  closeSidebar,
  setQuestionEmbeds,
  updateQuestionEmbed,
  updateQuestionEmbeds,
  resetReports,
} = reportsSlice.actions;

export const reportsReducer = reportsSlice.reducer;
