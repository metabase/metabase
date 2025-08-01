import { type PayloadAction, createSlice } from "@reduxjs/toolkit";

import type {
  Card,
  CardDisplayType,
  VisualizationSettings,
} from "metabase-types/api";

import type { CardEmbedRef } from "./components/Editor/types";

export interface DocumentsState {
  selectedEmbedIndex: number | null; // Index in cardEmbeds array
  // Draft state for currently editing embed
  draftCard: Card | null;
  cardEmbeds: CardEmbedRef[];
}

const initialState: DocumentsState = {
  selectedEmbedIndex: null,
  draftCard: null,
  cardEmbeds: [],
};

const documentsSlice = createSlice({
  name: "documents",
  initialState,
  reducers: {
    openVizSettingsSidebar: (
      state,
      action: PayloadAction<{ embedIndex: number; card: Card }>,
    ) => {
      state.selectedEmbedIndex = action.payload.embedIndex;
      // Initialize draftCard from the provided card
      state.draftCard = { ...action.payload.card };
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
      state.selectedEmbedIndex = null;
      state.draftCard = null;
    },
    setCardEmbeds: (state, action: PayloadAction<CardEmbedRef[]>) => {
      state.cardEmbeds = action.payload;
    },
    resetDocuments: () => initialState,
  },
});

export const {
  openVizSettingsSidebar,
  updateVizSettings,
  updateVisualizationType,
  clearDraftState,
  closeSidebar,
  setCardEmbeds,
  resetDocuments,
} = documentsSlice.actions;

export const documentsReducer = documentsSlice.reducer;
