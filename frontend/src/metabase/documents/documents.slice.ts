import {
  type PayloadAction,
  createAsyncThunk,
  createSlice,
} from "@reduxjs/toolkit";
import _ from "underscore";

import { loadMetadataForCard } from "metabase/questions/actions";
import type {
  Card,
  CardDisplayType,
  Document,
  VisualizationSettings,
} from "metabase-types/api";
import type {
  CardEmbedRef,
  DocumentsState,
  MentionCacheItem,
} from "metabase-types/store/documents";

import { getMentionsCacheKey } from "./utils/mentionsUtils";

let nextDraftCardId = -1;

export const loadMetadataForDocumentCard = createAsyncThunk(
  "documents/loadMetadataForDocumentCard",
  async (card: Card, { dispatch }) => {
    const cardForMetadata = card.id < 0 ? _.omit(card, "id") : card;
    await dispatch(loadMetadataForCard(cardForMetadata));
  },
);

export const initialState: DocumentsState = {
  selectedEmbedIndex: null,
  cardEmbeds: [],
  currentDocument: null,
  draftCards: {},
  mentionsCache: {},
  isCommentSidebarOpen: false,
  childTargetId: undefined,
  hoveredChildTargetId: undefined,
  hasUnsavedChanges: false,
  isHistorySidebarOpen: false,
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
      // @ts-expect-error - possibly infinite type error
      state.currentDocument = action.payload;
    },
    resetDocuments: () => {
      return initialState;
    },
    createDraftCard: (
      state,
      action: PayloadAction<{
        originalCard: Card | undefined;
        modifiedData: Partial<Card>;
        draftId: number;
      }>,
    ) => {
      const { originalCard, modifiedData, draftId } = action.payload;
      state.draftCards[draftId] = {
        ...originalCard,
        ...modifiedData,
        id: draftId,
      } as Card;
    },
    clearDraftCards: (state) => {
      state.draftCards = {};
    },
    updateMentionsCache: (
      state,
      { payload }: PayloadAction<MentionCacheItem>,
    ) => {
      state.mentionsCache[getMentionsCacheKey(payload)] = payload;
    },
    setIsCommentSidebarOpen: (state, action: PayloadAction<boolean>) => {
      state.isCommentSidebarOpen = action.payload;
    },
    setChildTargetId: (state, action: PayloadAction<string | undefined>) => {
      state.childTargetId = action.payload;
    },
    setHoveredChildTargetId: (
      state,
      action: PayloadAction<string | undefined>,
    ) => {
      state.hoveredChildTargetId = action.payload;
    },
    setHasUnsavedChanges: (state, action: PayloadAction<boolean>) => {
      state.hasUnsavedChanges = action.payload;
    },
    setIsHistorySidebarOpen: (state, action: PayloadAction<boolean>) => {
      state.isHistorySidebarOpen = action.payload;
    },
  },
});

export const {
  openVizSettingsSidebar,
  updateVizSettings,
  updateVisualizationType,
  closeSidebar,
  setCardEmbeds,
  setCurrentDocument,
  resetDocuments,
  createDraftCard,
  clearDraftCards,
  updateMentionsCache,
  setIsCommentSidebarOpen,
  setChildTargetId,
  setHoveredChildTargetId,
  setHasUnsavedChanges,
  setIsHistorySidebarOpen,
} = documentsSlice.actions;

export const generateDraftCardId = (): number => {
  const draftId = nextDraftCardId;
  nextDraftCardId -= 1;
  return draftId;
};

export const documentsReducer = documentsSlice.reducer;
