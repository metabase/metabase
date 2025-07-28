import { createSelector } from "@reduxjs/toolkit";
import _ from "underscore";

import type { Card, CardId } from "metabase-types/api";

import type { ReportsStoreState } from "./types";

export const getReportsState = (state: ReportsStoreState) =>
  state.plugins?.reports;

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
  (reports): CardId | null => {
    const { selectedEmbedIndex, cardEmbeds } = reports;
    if (selectedEmbedIndex === null || !cardEmbeds[selectedEmbedIndex]) {
      return null;
    }
    return cardEmbeds[selectedEmbedIndex].id;
  },
);

export const getIsSidebarOpen = createSelector(
  getReportsState,
  (reports): boolean => reports.isSidebarOpen,
);

export const getReportRawSeries = createSelector(
  [
    (state: any, cardId: CardId, _snapshotId: number, _embedId?: string) =>
      getReportCard(state, cardId),
    (state: any, _cardId: CardId, snapshotId: number, _embedId?: string) =>
      getReportDataset(state, snapshotId),
  ],
  (card, dataset) => {
    if (!card || !dataset?.data) {
      return null;
    }
    return [{ card, started_at: dataset.started_at, data: dataset.data }];
  },
);

// Get series with draft settings merged for the currently selected embed
export const getReportRawSeriesWithDraftSettings = createSelector(
  [
    (state: any, cardId: CardId, _snapshotId: number) =>
      getReportCardWithDraftSettings(state, cardId),
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

export const getCardEmbeds = createSelector(
  getReportsState,
  (reports) => reports?.cardEmbeds ?? [],
);

export const getEnrichedCardEmbeds = createSelector(
  [getReportsState],
  (reports) => {
    const cardEmbeds = reports?.cardEmbeds ?? [];
    const cards = reports?.cards ?? {};

    return cardEmbeds.map((embed) => ({
      ...embed,
      name: embed.name || cards[embed.id]?.name || `Question ${embed.id}`,
    }));
  },
);

export const getSelectedEmbedIndex = createSelector(
  getReportsState,
  (reports): number | null => reports.selectedEmbedIndex,
);

// Get card with draft settings merged for the currently selected embed
export const getReportCardWithDraftSettings = createSelector(
  [
    (state: any, cardId: CardId) => getReportCard(state, cardId),
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
    (state: any) => getReportsState(state).cards,
  ],
  (draftCard, cards) => {
    if (!draftCard) {
      return false;
    }

    const originalCard = cards[draftCard.id];
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
