import { type PayloadAction, createSlice } from "@reduxjs/toolkit";

import { CLOSE_QB } from "metabase/query_builder/actions";
import type {
  Card,
  CardDisplayType,
  Document,
  VisualizationSettings,
} from "metabase-types/api";

import type { CardEmbedRef } from "./components/Editor/types";

let nextDraftCardId = -1;

export interface DocumentsState {
  selectedEmbedIndex: number | null;
  cardEmbeds: CardEmbedRef[];
  currentDocument: Document | null;
  showNavigateBackToDocumentButton: boolean;
  draftCards: Record<number, Card>;
}

const initialState: DocumentsState = {
  selectedEmbedIndex: null,
  cardEmbeds: [],
  currentDocument: null,
  showNavigateBackToDocumentButton: false,
  draftCards: {},
};

const documentsSlice = createSlice({
  name: "documents",
  initialState,
  reducers: {
    openVizSettingsSidebar: (
      state,
      action: PayloadAction<{ embedIndex: number }>,
    ) => {
      state.selectedEmbedIndex = action.payload.embedIndex;
    },
    updateVizSettings: (
      state,
      action: PayloadAction<{
        cardId: number;
        settings: VisualizationSettings;
      }>,
    ) => {
      const { cardId, settings } = action.payload;
      if (state.draftCards[cardId]) {
        state.draftCards[cardId].visualization_settings = {
          ...state.draftCards[cardId].visualization_settings,
          ...settings,
        };
      }
    },
    updateVisualizationType: (
      state,
      action: PayloadAction<{ cardId: number; display: CardDisplayType }>,
    ) => {
      const { cardId, display } = action.payload;
      if (state.draftCards[cardId]) {
        state.draftCards[cardId].display = display;
      }
    },
    closeSidebar: (state) => {
      state.selectedEmbedIndex = null;
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
    resetDocuments: () => {
      return initialState;
    },
    createDraftCard: (
      state,
      action: PayloadAction<{
        originalCard: Card;
        modifiedData: Partial<Card>;
        draftId: number;
      }>,
    ) => {
      const { originalCard, modifiedData, draftId } = action.payload;
      state.draftCards[draftId] = {
        ...originalCard,
        ...modifiedData,
        id: draftId,
      };
    },
    updateDraftCard: (
      state,
      action: PayloadAction<{ id: number; modifiedData: Partial<Card> }>,
    ) => {
      const { id, modifiedData } = action.payload;
      if (state.draftCards[id]) {
        state.draftCards[id] = {
          ...state.draftCards[id],
          ...modifiedData,
        };
      }
    },
    clearDraftCards: (state) => {
      state.draftCards = {};
    },
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
  closeSidebar,
  setCardEmbeds,
  setCurrentDocument,
  setShowNavigateBackToDocumentButton,
  resetDocuments,
  createDraftCard,
  updateDraftCard,
  clearDraftCards,
} = documentsSlice.actions;

export const generateDraftCardId = (): number => {
  const draftId = nextDraftCardId;
  nextDraftCardId -= 1;
  return draftId;
};

export const documentsReducer = documentsSlice.reducer;
