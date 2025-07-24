import { createSelector } from "@reduxjs/toolkit";

import type { Card, CardId } from "metabase-types/api";

export const getReportsState = (state: any) => state.plugins?.reports;

export const getReportCard = createSelector(
  [getReportsState, (_, cardId: CardId) => cardId],
  (reports, cardId): Card | undefined => reports.cards[cardId],
);

export const getReportDataset = createSelector(
  [getReportsState, (_, snapshotId: number) => snapshotId],
  (reports, snapshotId) => reports.datasets[snapshotId],
);

export const getReportQuestionData = createSelector(
  [
    (state: any, cardId: CardId, _snapshotId: number) =>
      getReportCard(state, cardId),
    (state: any, _cardId: CardId, snapshotId: number) =>
      getReportDataset(state, snapshotId),
  ],
  (card, dataset) => (card && dataset ? { card, dataset } : null),
);

export const getIsLoadingCard = createSelector(
  [getReportsState, (_, cardId: CardId) => cardId],
  (reports, cardId): boolean => reports.loadingCards[cardId] ?? false,
);

export const getIsLoadingDataset = createSelector(
  [getReportsState, (_, snapshotId: number) => snapshotId],
  (reports, snapshotId): boolean =>
    reports.loadingDatasets[snapshotId] ?? false,
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
    (state: any, cardId: CardId, _snapshotId: number) =>
      getReportCard(state, cardId),
    (state: any, _cardId: CardId, snapshotId: number) =>
      getReportDataset(state, snapshotId),
  ],
  (card, dataset) => {
    if (!card || !dataset?.data) {
      return null;
    }
    return [{ card, started_at: dataset.started_at, data: dataset.data }];
  },
);

export const getHasModifiedVisualizationSettings = createSelector(
  [getReportsState, (_state: any, cardId: CardId) => cardId],
  (reportsState, cardId) =>
    reportsState?.modifiedVisualizationSettings?.[cardId] ?? false,
);

export const getQuestionRefs = createSelector(
  getReportsState,
  (reports) => reports?.questionRefs ?? [],
);

export const getEnrichedQuestionRefs = createSelector(
  [getReportsState],
  (reports) => {
    const questionRefs = reports?.questionRefs ?? [];
    const cards = reports?.cards ?? {};

    return questionRefs.map((ref) => ({
      ...ref,
      name: ref.name || cards[ref.id]?.name || `Question ${ref.id}`,
    }));
  },
);
