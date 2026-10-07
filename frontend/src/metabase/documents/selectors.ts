import { createSelector } from "@reduxjs/toolkit";

import type { State } from "metabase/redux/store";
import type { Card, CardId, TimelineEventId } from "metabase-types/api";

import { initialState } from "./documents.slice";

const EMPTY_TIMELINE_EVENT_IDS: TimelineEventId[] = [];

export const getDocumentsState = (state: State) =>
  state.documents || initialState;

export const getSidebar = createSelector(
  getDocumentsState,
  (documents) => documents.sidebar,
);

export const getSidebarMode = createSelector(
  getSidebar,
  (sidebar) => sidebar?.mode ?? null,
);

export const getIsSidebarOpen = createSelector(
  getSidebar,
  (sidebar) => sidebar !== null,
);

export const getSelectedEmbedIndex = createSelector(
  getSidebar,
  (sidebar): number | null => {
    if (
      sidebar?.mode === "viz-settings" ||
      sidebar?.mode === "timeline-events"
    ) {
      return sidebar.embedIndex;
    }
    return null;
  },
);

export const getSelectedQuestionId = createSelector(
  getDocumentsState,
  (documents): CardId | null => {
    const { sidebar, cardEmbeds } = documents;
    if (
      sidebar?.mode !== "viz-settings" &&
      sidebar?.mode !== "timeline-events"
    ) {
      return null;
    }
    return cardEmbeds[sidebar.embedIndex]?.id ?? null;
  },
);

export const getCardEmbeds = createSelector(
  getDocumentsState,
  (documents) => documents.cardEmbeds,
);

export const getSelectedCardEmbed = createSelector(
  [getCardEmbeds, getSelectedEmbedIndex],
  (cardEmbeds, selectedEmbedIndex) => {
    if (selectedEmbedIndex === null) {
      return null;
    }
    return cardEmbeds[selectedEmbedIndex];
  },
);

export const getCurrentDocument = createSelector(
  getDocumentsState,
  (documents) => documents?.currentDocument || null,
);

// Get all draft cards
export const getDraftCards = createSelector(
  getDocumentsState,
  (documents) => documents?.draftCards ?? {},
);

// Get a specific draft card by ID
export const getDraftCardById = createSelector(
  [getDraftCards, (_state, cardId: number) => cardId],
  (draftCards, cardId) => draftCards[cardId],
);

export const getDraftCardOriginalIds = createSelector(
  getDocumentsState,
  (documents) => documents?.draftCardOriginalIds ?? {},
);

/** Positive saved-card id a draft was forked from, if any. */
export const getDraftCardOriginalId = createSelector(
  [getDraftCardOriginalIds, (_state, draftId: number) => draftId],
  (originalIds, draftId): CardId | undefined => originalIds[draftId],
);

export const getCardWithDraft = createSelector(
  [
    getDraftCards,
    (_state, cardId: CardId) => cardId,
    (_state, _cardId: CardId, card?: Card) => card,
  ],
  (draftCards, cardId, card) => {
    const draftCard = draftCards[cardId];
    if (draftCard) {
      return draftCard;
    }
    return card;
  },
);

export const getMentionsCache = createSelector(
  getDocumentsState,
  (documents) => documents.mentionsCache,
);

export const getChildTargetId = createSelector(
  getDocumentsState,
  (documents) => documents.childTargetId,
);

export const getHoveredChildTargetId = createSelector(
  getDocumentsState,
  (documents) => documents.hoveredChildTargetId,
);

export const getHasUnsavedChanges = createSelector(
  getDocumentsState,
  (documents) => documents.hasUnsavedChanges,
);

export const getSelectedTimelineEventIds = createSelector(
  getSidebar,
  (sidebar): TimelineEventId[] => {
    if (sidebar?.mode === "timeline-events") {
      return sidebar.selectedEventIds;
    }
    return EMPTY_TIMELINE_EVENT_IDS;
  },
);

export const getFocusedTimelineEventIds = createSelector(
  getSidebar,
  (sidebar): TimelineEventId[] | null => {
    if (sidebar?.mode === "timeline-events") {
      return sidebar.focusedEventIds;
    }
    return null;
  },
);
