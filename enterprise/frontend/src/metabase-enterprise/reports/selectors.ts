import { createSelector } from "@reduxjs/toolkit";

import type { Card, CardId } from "metabase-types/api";

export const getReportsState = (state: any) => state.plugins?.reports;

export const getSelectedQuestionId = createSelector(
  getReportsState,
  (reports): CardId | null => {
    const { selectedEmbedIndex, questionEmbeds, draftCard } = reports;

    if (draftCard) {
      return draftCard.id;
    }

    if (selectedEmbedIndex === null || !questionEmbeds[selectedEmbedIndex]) {
      return null;
    }
    return questionEmbeds[selectedEmbedIndex].id;
  },
);

export const getIsSidebarOpen = createSelector(
  getReportsState,
  (reports): boolean => reports.isSidebarOpen,
);

export const getQuestionEmbeds = createSelector(
  getReportsState,
  (reports) => reports?.questionEmbeds ?? [],
);

export const getEnrichedQuestionEmbeds = createSelector(
  [getReportsState],
  (reports) => {
    const questionEmbeds = reports?.questionEmbeds ?? [];

    return questionEmbeds.map((embed) => ({
      ...embed,
      name: embed.name || `Question ${embed.id}`,
    }));
  },
);

export const getSelectedEmbedIndex = createSelector(
  getReportsState,
  (reports): number | null => reports.selectedEmbedIndex,
);

export const getHasDraftChanges = createSelector(
  [(state: any) => getReportsState(state).draftCard],
  (draftCard) => {
    return !!draftCard;
  },
);

export const getCardForEmbedIndex = createSelector(
  [
    (_state: any, _embedIndex: number, card: Card | undefined) => card,
    (_state: any, embedIndex: number) => embedIndex,
    (state: any) => getReportsState(state).selectedEmbedIndex,
    (state: any) => getReportsState(state).draftCard,
  ],
  (card, embedIndex, selectedEmbedIndex, draftCard) => {
    if (
      embedIndex === selectedEmbedIndex &&
      draftCard &&
      card &&
      draftCard.id === card.id
    ) {
      return draftCard;
    }
    return card;
  },
);
