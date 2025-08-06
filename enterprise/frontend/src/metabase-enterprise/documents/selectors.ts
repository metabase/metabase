import { createSelector } from "@reduxjs/toolkit";

import { canonicalCollectionId } from "metabase/collections/utils";
import type { Card, CardId, RegularCollectionId } from "metabase-types/api";

import type { DocumentsStoreState } from "./types";

export const getDocumentsState = (state: DocumentsStoreState) =>
  state.plugins?.documents;

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
  (documents) => documents?.currentDocument,
);

export const getDocumentCollectionId = createSelector(
  getCurrentDocument,
  (document): RegularCollectionId | null =>
    canonicalCollectionId(document?.collection_id),
);

export const getShowNavigateBackToDocumentButton = createSelector(
  getDocumentsState,
  (documents) => documents?.showNavigateBackToDocumentButton ?? false,
);

// For backwards compatibility with DocumentBackButton
export const getDocument = getCurrentDocument;

// Get all draft cards
export const getDraftCards = createSelector(
  getDocumentsState,
  (documents) => documents?.draftCards ?? {},
);

// Get a specific draft card by ID
export const getDraftCardById = createSelector(
  [getDraftCards, (_state: any, cardId: number) => cardId],
  (draftCards, cardId) => draftCards[cardId],
);

// Get card with draft settings merged
export const getCardWithDraft = createSelector(
  [
    getDraftCards,
    (_state: any, cardId: CardId) => cardId,
    (_state: any, _cardId: CardId, card?: Card) => card,
  ],
  (draftCards, cardId, card) => {
    const draftCard = draftCards[cardId];
    if (draftCard) {
      return draftCard;
    }
    return card;
  },
);
