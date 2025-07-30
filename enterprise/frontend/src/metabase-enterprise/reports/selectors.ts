import { createSelector } from "@reduxjs/toolkit";
import _ from "underscore";

import type { Card, CardId } from "metabase-types/api";

import type { ReportsStoreState } from "./types";

export const getReportsState = (state: ReportsStoreState) =>
  state.plugins?.reports;

export const getSelectedQuestionId = createSelector(
  getReportsState,
  (reports): CardId | null => {
    const { selectedEmbedIndex, cardEmbeds } = reports;
    if (selectedEmbedIndex === null || !cardEmbeds[selectedEmbedIndex]) {
      return null;
    }
    return cardEmbeds[selectedEmbedIndex].id;
  },
);

export const getCardEmbeds = createSelector(
  getReportsState,
  (reports) => reports?.cardEmbeds ?? [],
);

export const getSelectedEmbedIndex = createSelector(
  getReportsState,
  (reports): number | null => reports.selectedEmbedIndex,
);

// Get draft card for the currently selected embed
export const getDraftCard = createSelector(
  getReportsState,
  (reports) => reports.draftCard,
);

// Get card with draft settings merged for the currently selected embed
export const getReportCardWithDraftSettings = createSelector(
  [
    (_state: any, _cardId: CardId, card?: Card) => card,
    (state: any) => getReportsState(state).draftCard,
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
    (state: any) => getReportsState(state).draftCard,
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
