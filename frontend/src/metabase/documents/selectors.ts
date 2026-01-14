import { createSelector } from "@reduxjs/toolkit";

import type { Card, CardId } from "metabase-types/api";
import type { State } from "metabase-types/store";

import { initialState } from "./documents.slice";

export const getDocumentsState = (state: State) =>
  state.documents || initialState;

export const getSelectedQuestionId = createSelector(
  getDocumentsState,
  (documents): CardId | null => {
    const { selectedEmbedIndex, cardEmbeds } = documents;
    if (selectedEmbedIndex === null || !cardEmbeds[selectedEmbedIndex]) {
      return null;
    }
    return cardEmbeds[selectedEmbedIndex].id;
  },
);

export const getSidebarOpen = createSelector(
  getDocumentsState,
  (state) => state.selectedEmbedIndex !== null,
);

export const getCommentSidebarOpen = createSelector(
  getDocumentsState,
  (state) => state.isCommentSidebarOpen,
);

export const getCardEmbeds = createSelector(
  getDocumentsState,
  (documents) => documents?.cardEmbeds ?? [],
);

export const getSelectedEmbedIndex = createSelector(
  getDocumentsState,
  (documents): number | null => documents.selectedEmbedIndex,
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

export const getIsHistorySidebarOpen = createSelector(
  getDocumentsState,
  (documents) => documents.isHistorySidebarOpen,
);
