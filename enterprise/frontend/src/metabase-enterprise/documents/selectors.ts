import { createSelector } from "@reduxjs/toolkit";
import _ from "underscore";

import type { Card, CardId } from "metabase-types/api";

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

// Get draft card for the currently selected embed
export const getDraftCard = createSelector(
  getDocumentsState,
  (documents) => documents.draftCard,
);

// Get card with draft settings merged for the currently selected embed
export const getDocumentCardWithDraftSettings = createSelector(
  [
    (_state: any, _cardId: CardId, card?: Card) => card,
    (state: any) => getDocumentsState(state).draftCard,
  ],
  (card, draftCard) => {
    if (!card) {
      return undefined;
    }

    // If we have a draftCard for this cardId, return it
    if (draftCard && draftCard.id === card.id) {
      return draftCard;
    }

    // Otherwise return the original card
    return card;
  },
);

// Check if there are pending draft changes
export const getHasDraftChanges = createSelector(
  [
    (state: any) => getDocumentsState(state).draftCard,
    (_state: any, originalCard?: Card) => originalCard,
  ],
  (draftCard, originalCard) => {
    if (!draftCard) {
      return false;
    }

    if (!originalCard) {
      return true; // If we have a draft but no original, consider it a change
    }

    // Check if display or visualization_settings have changed
    return (
      draftCard.display !== originalCard.display ||
      !_.isEqual(
        draftCard.visualization_settings,
        originalCard.visualization_settings,
      )
    );
  },
);
