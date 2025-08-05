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
  // Index in cardEmbeds array
  selectedEmbedIndex: number | null;
  cardEmbeds: CardEmbedRef[];
  currentDocument: Document | null;
  // Flag to show navigate back to document button (set when navigating from document to question)
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

// Reset the draft card ID counter
const resetDraftCardIdCounter = () => {
  nextDraftCardId = -1;
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
      resetDraftCardIdCounter();
      return initialState;
    },
    createDraftCard: {
      reducer: (
        state,
        action: PayloadAction<
          { originalCard: Card; modifiedData: Partial<Card> },
          string,
          never,
          number
        >,
      ) => {
        const { originalCard, modifiedData } = action.payload;
        const draftId = nextDraftCardId;
        state.draftCards[draftId] = {
          ...originalCard,
          ...modifiedData,
          id: draftId,
        };
        nextDraftCardId -= 1;
      },
      prepare: (payload: {
        originalCard: Card;
        modifiedData: Partial<Card>;
      }) => {
        // Return the draft ID in the meta field
        return { payload };
      },
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
      resetDraftCardIdCounter();
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

// Export helper to get next draft ID (for use in actions)
export const getNextDraftCardId = () => nextDraftCardId;

export const documentsReducer = documentsSlice.reducer;
