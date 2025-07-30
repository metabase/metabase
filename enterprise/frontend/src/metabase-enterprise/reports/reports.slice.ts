import { type PayloadAction, createSlice } from "@reduxjs/toolkit";

import { cardApi } from "metabase/api";
import { createAsyncThunk } from "metabase/lib/redux";
import { loadMetadataForCard } from "metabase/questions/actions";
import type {
  Card,
  CardDisplayType,
  CardId,
  Dataset,
  VisualizationSettings,
} from "metabase-types/api";

import type { CardEmbedRef } from "./components/Editor/types";

export interface ReportsState {
  cards: Record<CardId, Card>;
  datasets: Record<number, Dataset>;
  loadingCards: Record<CardId, boolean>;
  loadingDatasets: Record<number, boolean>;
  selectedEmbedIndex: number | null; // Index in cardEmbeds array
  // Draft state for currently editing embed
  draftCard: Card | null;
  cardEmbeds: CardEmbedRef[];
}

const initialState: ReportsState = {
  cards: {},
  datasets: {},
  loadingCards: {},
  loadingDatasets: {},
  selectedEmbedIndex: null,
  draftCard: null,
  cardEmbeds: [],
};

export const fetchReportCard = createAsyncThunk<Card, CardId>(
  "reports/fetchCard",
  async (cardId, { dispatch }) => {
    const result = await dispatch(
      cardApi.endpoints.getCard.initiate({ id: cardId }),
    );
    if (result.data != null) {
      dispatch(loadMetadataForCard(result.data));
      return result.data;
    }
    throw new Error(`Failed to fetch card with id: ${cardId}`);
  },
);

export const fetchCardDataset = createAsyncThunk<Dataset, CardId>(
  "reports/fetchCardDataset",
  async (cardId, { dispatch }) => {
    const result = await dispatch(
      cardApi.endpoints.getCardQuery.initiate(
        { cardId },
        { forceRefetch: true },
      ),
    );
    if (result.data != null) {
      return result.data;
    }
    throw new Error("Failed to fetch card dataset");
  },
);

export const fetchReportQuestionData = createAsyncThunk<
  { card: Card; dataset: Dataset },
  { cardId: CardId; forceRefresh?: boolean }
>(
  "reports/fetchQuestionData",
  async (
    { cardId, forceRefresh = false },
    { dispatch, getState, rejectWithValue },
  ) => {
    const state = getState() as any;
    const existingCard = state.plugins?.reports?.cards[cardId];
    const existingDataset = state.plugins?.reports?.datasets[cardId];

    const promises = [];
    if (!existingCard || forceRefresh) {
      promises.push(dispatch(fetchReportCard(cardId)));
    }
    if (!existingDataset || forceRefresh) {
      promises.push(dispatch(fetchCardDataset(cardId)));
    }

    if (promises.length > 0) {
      const results = await Promise.all(promises);

      for (const result of results) {
        if (result.type.endsWith("/rejected")) {
          return rejectWithValue("Failed to fetch required data");
        }
      }
    }

    const finalState = getState() as any;
    const card = finalState.plugins?.reports?.cards[cardId] || existingCard;
    const dataset =
      finalState.plugins?.reports?.datasets[cardId] || existingDataset;

    if (card && dataset) {
      return {
        card,
        dataset,
      };
    }

    return rejectWithValue("Card or dataset not found after fetching");
  },
);

const reportsSlice = createSlice({
  name: "reports",
  initialState,
  reducers: {
    openVizSettingsSidebar: (
      state,
      action: PayloadAction<{ embedIndex: number }>,
    ) => {
      state.selectedEmbedIndex = action.payload.embedIndex;
      // Initialize draftCard from the selected embed's card
      const embed = state.cardEmbeds[action.payload.embedIndex];
      if (embed && state.cards[embed.id]) {
        state.draftCard = { ...state.cards[embed.id] };
      }
    },
    updateVizSettings: (
      state,
      action: PayloadAction<{
        settings: VisualizationSettings;
      }>,
    ) => {
      const { settings } = action.payload;
      if (state.draftCard) {
        state.draftCard.visualization_settings = {
          ...state.draftCard.visualization_settings,
          ...settings,
        };
      }
    },
    updateVisualizationType: (
      state,
      action: PayloadAction<{ display: CardDisplayType }>,
    ) => {
      const { display } = action.payload;
      if (state.draftCard) {
        state.draftCard.display = display;
      }
    },
    clearDraftState: (state) => {
      state.draftCard = null;
      state.selectedEmbedIndex = null;
    },
    closeSidebar: (state) => {
      state.selectedEmbedIndex = null;
      state.draftCard = null;
    },
    setCardEmbeds: (state, action: PayloadAction<CardEmbedRef[]>) => {
      state.cardEmbeds = action.payload;
    },
    updateCardEmbed: (state, action: PayloadAction<{ embedIndex: number }>) => {
      const { embedIndex } = action.payload;
      // This action now just triggers a refresh, no longer updating snapshot ID
      // The actual data will be refreshed by the component
    },
    updateCardEmbeds: (
      state,
      action: PayloadAction<Array<{ embedIndex: number }>>,
    ) => {
      // This action now just triggers a refresh, no longer updating snapshot IDs
      // The actual data will be refreshed by the components
    },
    resetReports: () => initialState,
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchReportCard.pending, (state, action) => {
        state.loadingCards[action.meta.arg] = true;
      })
      .addCase(fetchReportCard.fulfilled, (state, action) => {
        const card = action.payload;
        const existingCard = state.cards[card.id];
        if (existingCard?.visualization_settings) {
          card.visualization_settings = {
            ...card.visualization_settings,
            ...existingCard.visualization_settings,
          };
        }
        state.cards[card.id] = card;

        state.loadingCards[card.id] = false;
      })
      .addCase(fetchReportCard.rejected, (state, action) => {
        state.loadingCards[action.meta.arg] = false;
      })
      .addCase(fetchCardDataset.pending, (state, action) => {
        state.loadingDatasets[action.meta.arg] = true;
      })
      .addCase(fetchCardDataset.fulfilled, (state, action) => {
        const dataset = action.payload;
        const cardId = action.meta.arg;

        state.datasets[cardId] = dataset;

        state.loadingDatasets[cardId] = false;
      })
      .addCase(fetchCardDataset.rejected, (state, action) => {
        state.loadingDatasets[action.meta.arg] = false;
      })
      .addCase(fetchReportQuestionData.pending, (state, action) => {
        const { cardId } = action.meta.arg;
        if (!state.cards[cardId]) {
          state.loadingCards[cardId] = true;
        }
        if (!state.datasets[cardId]) {
          state.loadingDatasets[cardId] = true;
        }
      })
      .addCase(fetchReportQuestionData.fulfilled, (state, action) => {
        const { card, dataset } = action.payload;
        const { cardId } = action.meta.arg;

        state.cards[card.id] = card;
        state.datasets[cardId] = dataset;

        state.loadingCards[card.id] = false;
        state.loadingDatasets[cardId] = false;
      })
      .addCase(fetchReportQuestionData.rejected, (state, action) => {
        const { cardId } = action.meta.arg;
        state.loadingCards[cardId] = false;
        state.loadingDatasets[cardId] = false;
      });
  },
});

export const {
  openVizSettingsSidebar,
  updateVizSettings,
  updateVisualizationType,
  clearDraftState,
  closeSidebar,
  setCardEmbeds,
  updateCardEmbed,
  updateCardEmbeds,
  resetReports,
} = reportsSlice.actions;

export const reportsReducer = reportsSlice.reducer;
