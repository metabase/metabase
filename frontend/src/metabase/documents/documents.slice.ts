import {
  type PayloadAction,
  createAsyncThunk,
  createSlice,
} from "@reduxjs/toolkit";
import _ from "underscore";

import { loadMetadataForCard } from "metabase/questions/actions";
import type {
  CardEmbedRef,
  DocumentsState,
  MentionCacheItem,
} from "metabase/redux/store/documents";
import type {
  Card,
  Document,
  TimelineEvent,
  TimelineEventId,
  VisualizationDisplay,
  VisualizationSettings,
} from "metabase-types/api";

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
  sidebar: null,
  cardEmbeds: [],
  currentDocument: null,
  draftCards: {},
  draftCardOriginalIds: {},
  mentionsCache: {},
  childTargetId: undefined,
  hoveredChildTargetId: undefined,
  hasUnsavedChanges: false,
};

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - possibly infinite type error
const documentsSlice = createSlice({
  name: "documents",
  initialState,
  reducers: {
    setSidebarEmbedIndex: (state, action: PayloadAction<number>) => {
      if (
        state.sidebar?.mode === "viz-settings" ||
        state.sidebar?.mode === "timeline-events"
      ) {
        if (state.sidebar.embedIndex === action.payload) {
          // avoid clearing selectedEventIds/focusedEventIds if the embedIndex didn't change
          return;
        }
        state.sidebar.embedIndex = action.payload;
        if (state.sidebar.mode === "timeline-events") {
          state.sidebar.selectedEventIds = [];
          state.sidebar.focusedEventIds = null;
        }
      }
    },
    openVizSettingsSidebar: (
      state,
      action: PayloadAction<{ embedIndex: number }>,
    ) => {
      state.sidebar = {
        mode: "viz-settings",
        embedIndex: action.payload.embedIndex,
      };
    },
    openTimelineEventsSidebar: (
      state,
      action: PayloadAction<{
        embedIndex: number;
        focusedEventIds?: TimelineEventId[];
      }>,
    ) => {
      const { embedIndex, focusedEventIds } = action.payload;
      state.sidebar = {
        mode: "timeline-events",
        embedIndex,
        focusedEventIds: focusedEventIds ?? null,
        selectedEventIds: focusedEventIds ?? [],
      };
    },
    openCommentsSidebar: (state) => {
      state.sidebar = { mode: "comments" };
    },
    openHistorySidebar: (state) => {
      state.sidebar = { mode: "history" };
    },
    selectTimelineEvents: (state, action: PayloadAction<TimelineEvent[]>) => {
      if (state.sidebar?.mode === "timeline-events") {
        state.sidebar.selectedEventIds = action.payload.map(
          (event) => event.id,
        );
      }
    },
    deselectTimelineEvents: (state) => {
      if (state.sidebar?.mode === "timeline-events") {
        state.sidebar.selectedEventIds = [];
      }
    },
    clearFocusedTimelineEvents: (state) => {
      if (state.sidebar?.mode === "timeline-events") {
        state.sidebar.focusedEventIds = null;
      }
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
      action: PayloadAction<{ cardId: number; display: VisualizationDisplay }>,
    ) => {
      const { cardId, display } = action.payload;
      if (state.draftCards[cardId]) {
        state.draftCards[cardId].display = display;
      }
    },
    closeSidebar: (state) => {
      state.sidebar = null;
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
    createDraftCard: (
      state,
      action: PayloadAction<{
        originalCard: Card | undefined;
        modifiedData: Partial<Card>;
        draftId: number;
      }>,
    ) => {
      const { originalCard, modifiedData, draftId } = action.payload;
      // Unjustified type cast. FIXME
      state.draftCards[draftId] = {
        ...originalCard,
        ...modifiedData,
        id: draftId,
      } as Card;

      const originalCardId = originalCard?.id;
      if (originalCardId != null && originalCardId > 0) {
        state.draftCardOriginalIds[draftId] = originalCardId;
      }
    },
    clearDraftCards: (state) => {
      state.draftCards = {};
      state.draftCardOriginalIds = {};
    },
    updateMentionsCache: (
      state,
      { payload }: PayloadAction<MentionCacheItem>,
    ) => {
      state.mentionsCache[getMentionsCacheKey(payload)] = payload;
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
  },
});

export const {
  setSidebarEmbedIndex,
  openVizSettingsSidebar,
  openTimelineEventsSidebar,
  openCommentsSidebar,
  openHistorySidebar,
  selectTimelineEvents,
  deselectTimelineEvents,
  clearFocusedTimelineEvents,
  updateVizSettings,
  updateVisualizationType,
  closeSidebar,
  setCardEmbeds,
  setCurrentDocument,
  resetDocuments,
  createDraftCard,
  clearDraftCards,
  updateMentionsCache,
  setChildTargetId,
  setHoveredChildTargetId,
  setHasUnsavedChanges,
} = documentsSlice.actions;

export const generateDraftCardId = (): number => {
  const draftId = nextDraftCardId;
  nextDraftCardId -= 1;
  return draftId;
};

export const documentsReducer = documentsSlice.reducer;
