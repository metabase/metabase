import { createSelector } from "@reduxjs/toolkit";

import type { Card, CardId } from "metabase-types/api";

// Use a more flexible typing approach that works with the existing State interface
export const getReportsState = (state: any) => state.plugins?.reports;

export const getReportCard = createSelector(
  [getReportsState, (_, cardId: CardId) => cardId],
  (reports, cardId): Card | undefined => reports.cards[cardId],
);

export const getReportDataset = createSelector(
  [getReportsState, (_, cardId: CardId) => cardId],
  (reports, cardId) => reports.datasets[cardId],
);

export const getReportQuestionData = createSelector(
  [
    (state: any, cardId: CardId) => getReportCard(state, cardId),
    (state: any, cardId: CardId) => getReportDataset(state, cardId),
  ],
  (card, dataset) => (card && dataset ? { card, dataset } : null),
);

export const getIsLoadingCard = createSelector(
  [getReportsState, (_, cardId: CardId) => cardId],
  (reports, cardId): boolean => reports.loadingCards[cardId] ?? false,
);

export const getIsLoadingDataset = createSelector(
  [getReportsState, (_, cardId: CardId) => cardId],
  (reports, cardId): boolean => reports.loadingDatasets[cardId] ?? false,
);

export const getSelectedQuestionId = createSelector(
  getReportsState,
  (reports): CardId | null => reports.selectedQuestionId,
);

export const getIsSidebarOpen = createSelector(
  getReportsState,
  (reports): boolean => reports.isSidebarOpen,
);

export const getReportRawSeries = createSelector(
  [
    (state: any, cardId: CardId) => getReportCard(state, cardId),
    (state: any, cardId: CardId) => getReportDataset(state, cardId),
  ],
  (card, dataset) => {
    if (!card || !dataset?.data) {
      return null;
    }
    return [{ card, data: dataset.data }];
  },
);
