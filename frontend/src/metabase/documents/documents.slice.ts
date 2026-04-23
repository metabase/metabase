import {
  type PayloadAction,
  createAsyncThunk,
  createSlice,
} from "@reduxjs/toolkit";

import { loadMetadataForCard } from "metabase/questions/actions";
import type {
  CardEmbedRef,
  DocumentsState,
  MentionCacheItem,
} from "metabase/redux/store/documents";
import type { Card, Document } from "metabase-types/api";

import { getMentionsCacheKey } from "./utils/mentionsUtils";

export const loadMetadataForDocumentCard = createAsyncThunk(
  "documents/loadMetadataForDocumentCard",
  async (card: Card, { dispatch }) => {
    await dispatch(loadMetadataForCard(card));
  },
);

export const initialState: DocumentsState = {
  selectedEmbedIndex: null,
  cardEmbeds: [],
  currentDocument: null,
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
    closeSidebar: (state) => {
      state.selectedEmbedIndex = null;
    },
    setCardEmbeds: (state, action: PayloadAction<CardEmbedRef[]>) => {
      state.cardEmbeds = action.payload;
    },
    setCurrentDocument: (state, action: PayloadAction<Document | null>) => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore - possibly infinite type error
      state.currentDocument = action.payload;
    },
    resetDocuments: () => {
      return initialState;
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
  closeSidebar,
  setCardEmbeds,
  setCurrentDocument,
  resetDocuments,
  updateMentionsCache,
  setIsCommentSidebarOpen,
  setChildTargetId,
  setHoveredChildTargetId,
  setHasUnsavedChanges,
  setIsHistorySidebarOpen,
} = documentsSlice.actions;

export const documentsReducer = documentsSlice.reducer;
