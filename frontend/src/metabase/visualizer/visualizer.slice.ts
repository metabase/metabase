import {
  type PayloadAction,
  createSelector,
  createSlice,
} from "@reduxjs/toolkit";

import { cardApi } from "metabase/api";
import { createAsyncThunk } from "metabase/lib/redux";
import type { Card, CardId, Dataset, RawSeries } from "metabase-types/api";
import type { VisualizerState } from "metabase-types/store/visualizer";

const initialState: VisualizerState = {
  cards: [],
  datasets: {},
  loadingCards: {},
  loadingDatasets: {},
  expandedCards: {},
  error: null,
  selectedCardId: null,
};

export const addCard = createAsyncThunk(
  "visualizer/dataImporter/addCard",
  async (cardId: CardId, { dispatch }) => {
    await dispatch(fetchCard(cardId));
    await dispatch(fetchCardQuery(cardId));
  },
);

export const fetchCard = createAsyncThunk<Card, CardId>(
  "visualizer/fetchCard",
  async (cardId, { dispatch }) => {
    const result = await dispatch(
      cardApi.endpoints.getCard.initiate({ id: cardId }),
    );
    if (result.data != null) {
      return result.data;
    }
    throw new Error("Failed to fetch card");
  },
);

export const fetchCardQuery = createAsyncThunk<Dataset, CardId>(
  "visualizer/fetchCardQuery",
  async (cardId, { dispatch }) => {
    const result = await dispatch(
      cardApi.endpoints.getCardQuery.initiate({ cardId, parameters: [] }),
    );
    if (result.data != null) {
      return result.data;
    }
    throw new Error("Failed to fetch card query");
  },
);

const visualizerSlice = createSlice({
  name: "visualizer",
  initialState,
  reducers: {
    removeCard: (state, action: PayloadAction<CardId>) => {
      const cardId = action.payload;
      state.cards = state.cards.filter(card => card.id !== cardId);
      delete state.expandedCards[cardId];
      delete state.loadingCards[cardId];
      delete state.datasets[cardId];
      delete state.loadingDatasets[cardId];
    },
    toggleCardExpanded: (state, action: PayloadAction<CardId>) => {
      const cardId = action.payload;
      state.expandedCards[cardId] = !state.expandedCards[cardId];
    },
    setSelectedCard: (state, action: PayloadAction<CardId | null>) => {
      state.selectedCardId = action.payload;
    },
  },
  extraReducers: builder => {
    builder
      .addCase(fetchCard.pending, (state, action) => {
        state.loadingCards[action.meta.arg] = true;
        state.error = null;
      })
      .addCase(fetchCard.fulfilled, (state, action) => {
        const card = action.payload;
        const index = state.cards.findIndex(c => c.id === card.id);
        if (index !== -1) {
          state.cards[index] = card;
        } else {
          state.cards.push(card);
        }
        state.loadingCards[card.id] = false;
        state.expandedCards[card.id] = true;
        if (!state.selectedCardId) {
          state.selectedCardId = card.id;
        }
      })
      .addCase(fetchCard.rejected, (state, action) => {
        if (action.meta.arg) {
          state.loadingCards[action.meta.arg] = false;
        }
        state.error = action.error.message || "Failed to fetch card";
      })
      .addCase(fetchCardQuery.pending, (state, action) => {
        state.loadingDatasets[action.meta.arg] = true;
        state.error = null;
      })
      .addCase(fetchCardQuery.fulfilled, (state, action) => {
        state.datasets[action.meta.arg] = action.payload;
        state.loadingDatasets[action.meta.arg] = false;
      })
      .addCase(fetchCardQuery.rejected, (state, action) => {
        if (action.meta.arg) {
          state.loadingDatasets[action.meta.arg] = false;
        }
        state.error = action.error.message || "Failed to fetch card query";
      });
  },
});

export const { removeCard, toggleCardExpanded, setSelectedCard } =
  visualizerSlice.actions;

export const { reducer } = visualizerSlice;

export const selectCards = (state: { visualizer: VisualizerState }) =>
  state.visualizer.cards;
export const selectDatasets = (state: { visualizer: VisualizerState }) =>
  state.visualizer.datasets;
export const selectLoadingCards = (state: { visualizer: VisualizerState }) =>
  state.visualizer.loadingCards;
export const selectLoadingDatasets = (state: { visualizer: VisualizerState }) =>
  state.visualizer.loadingDatasets;
export const selectError = (state: { visualizer: VisualizerState }) =>
  state.visualizer.error;
export const selectExpandedCards = (state: { visualizer: VisualizerState }) =>
  state.visualizer.expandedCards;
export const selectSelectedCardId = (state: { visualizer: VisualizerState }) =>
  state.visualizer.selectedCardId;

export const selectCardIds = createSelector(
  [selectCards],
  (cards: Card[]) => new Set(cards.map(card => card.id)),
);

export const getVisualizerRawSeries = createSelector(
  [selectCards, selectDatasets, selectSelectedCardId],
  (cards, datasets, selectedCardId): RawSeries => {
    if (selectedCardId == null) {
      return [];
    }

    const selectedCard = cards.find(card => card.id === selectedCardId);
    const dataset = selectedCard ? datasets[selectedCard.id] : null;

    if (selectedCard == null || dataset == null) {
      return [];
    }

    return [
      {
        card: selectedCard,
        ...dataset,
      },
    ];
  },
);
