import { type PayloadAction, createSlice } from "@reduxjs/toolkit";

import { CLOSE_QB } from "metabase/query_builder/actions";
import type {
  Card,
  CardDisplayType,
  Document,
  VisualizationSettings,
} from "metabase-types/api";

import type { CardEmbedRef } from "./components/Editor/types";

export interface DocumentsState {
  // Index in cardEmbeds array
  selectedEmbedIndex: number | null;
  draftCard: Card | null;
  cardEmbeds: CardEmbedRef[];
  currentDocument: Document | null;
  // Flag to show navigate back to document button (set when navigating from document to question)
  showNavigateBackToDocumentButton: boolean;
}

const initialState: DocumentsState = {
  selectedEmbedIndex: null,
  draftCard: null,
  cardEmbeds: [],
  currentDocument: null,
  showNavigateBackToDocumentButton: false,
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
    setCurrentDocument: (state, action: PayloadAction<Document | null>) => {
      state.currentDocument = action.payload;
    },
    setShowNavigateBackToDocumentButton: (
      state,
      action: PayloadAction<boolean>,
    ) => {
      state.showNavigateBackToDocumentButton = action.payload;
    },
    resetDocuments: () => initialState,
  },
  extraReducers: (builder) => {
    builder.addCase(CLOSE_QB, (state) => {
      state.showNavigateBackToDocumentButton = false;
    });
  },
});

export const {
  openVizSettingsSidebar,
  updateVizSettings,
  updateVisualizationType,
  clearDraftState,
  closeSidebar,
  setCardEmbeds,
  setCurrentDocument,
  setShowNavigateBackToDocumentButton,
  resetDocuments,
} = documentsSlice.actions;

export const documentsReducer = documentsSlice.reducer;
