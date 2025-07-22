import { type PayloadAction, createSlice } from "@reduxjs/toolkit";

import { cardApi } from "metabase/api";
import { createAsyncThunk } from "metabase/lib/redux";
import type {
  Card,
  CardId,
  Dataset,
  VisualizationSettings,
} from "metabase-types/api";
export interface ReportsState {
  cards: Record<CardId, Card>;
  datasets: Record<CardId, Dataset>;
  loadingCards: Record<CardId, boolean>;
  loadingDatasets: Record<CardId, boolean>;
  selectedQuestionId: CardId | null;
  vizSettingsUpdates: Record<CardId, VisualizationSettings>;
}

const initialState: ReportsState = {
  cards: {},
  datasets: {},
  loadingCards: {},
  loadingDatasets: {},
  selectedQuestionId: null,
  vizSettingsUpdates: {},
};

export const fetchReportCard = createAsyncThunk<Card, CardId>(
  "reports/fetchCard",
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

export const fetchReportCardQuery = createAsyncThunk<
  { cardId: CardId; data: Dataset },
  CardId
>("reports/fetchCardQuery", async (cardId, { dispatch }) => {
  const result = await dispatch(
    cardApi.endpoints.getCardQuery.initiate({ cardId, parameters: [] }),
  );
  if (result.data != null) {
    return { cardId, data: result.data };
  }
  throw new Error("Failed to fetch card query");
});

export const fetchReportQuestionData = createAsyncThunk<
  { card: Card; dataset: Dataset },
  CardId
>("reports/fetchQuestionData", async (cardId, { dispatch }) => {
  const [cardResult, queryResult] = await Promise.all([
    dispatch(fetchReportCard(cardId)),
    dispatch(fetchReportCardQuery(cardId)),
  ]);

  if (cardResult.payload && queryResult.payload) {
    return {
      card: cardResult.payload as Card,
      dataset: (queryResult.payload as any).data,
    };
  }
  throw new Error("Failed to fetch question data");
});

const reportsSlice = createSlice({
  name: "reports",
  initialState,
  reducers: {
    selectQuestion: (state, action: PayloadAction<CardId | null>) => {
      state.selectedQuestionId = action.payload;
    },
    updateVizSettings: (
      state,
      action: PayloadAction<{
        cardId: CardId;
        settings: VisualizationSettings;
      }>,
    ) => {
      const { cardId, settings } = action.payload;
      state.vizSettingsUpdates[cardId] = {
        ...state.vizSettingsUpdates[cardId],
        ...settings,
      };
    },
    applyVizSettings: (state, action: PayloadAction<CardId>) => {
      const cardId = action.payload;
      const card = state.cards[cardId];
      const updates = state.vizSettingsUpdates[cardId];
      if (card && updates) {
        state.cards[cardId] = {
          ...card,
          visualization_settings: {
            ...card.visualization_settings,
            ...updates,
          },
        };
        delete state.vizSettingsUpdates[cardId];
      }
    },
    clearVizSettingsUpdates: (state, action: PayloadAction<CardId>) => {
      delete state.vizSettingsUpdates[action.payload];
    },
    resetReports: () => initialState,
  },
  extraReducers: (builder) => {
    builder
      // Handle fetchReportCard
      .addCase(fetchReportCard.pending, (state, action) => {
        state.loadingCards[action.meta.arg] = true;
      })
      .addCase(fetchReportCard.fulfilled, (state, action) => {
        const card = action.payload;
        state.cards[card.id] = card;
        state.loadingCards[card.id] = false;
      })
      .addCase(fetchReportCard.rejected, (state, action) => {
        state.loadingCards[action.meta.arg] = false;
      })
      // Handle fetchReportCardQuery
      .addCase(fetchReportCardQuery.pending, (state, action) => {
        state.loadingDatasets[action.meta.arg] = true;
      })
      .addCase(fetchReportCardQuery.fulfilled, (state, action) => {
        const { cardId, data } = action.payload;
        state.datasets[cardId] = data;
        state.loadingDatasets[cardId] = false;
      })
      .addCase(fetchReportCardQuery.rejected, (state, action) => {
        state.loadingDatasets[action.meta.arg] = false;
      })
      // Handle fetchReportQuestionData
      .addCase(fetchReportQuestionData.pending, (state, action) => {
        const cardId = action.meta.arg;
        state.loadingCards[cardId] = true;
        state.loadingDatasets[cardId] = true;
      })
      .addCase(fetchReportQuestionData.fulfilled, (state, action) => {
        const { card, dataset } = action.payload;
        state.cards[card.id] = card;
        state.datasets[card.id] = dataset;
        state.loadingCards[card.id] = false;
        state.loadingDatasets[card.id] = false;
      })
      .addCase(fetchReportQuestionData.rejected, (state, action) => {
        const cardId = action.meta.arg;
        state.loadingCards[cardId] = false;
        state.loadingDatasets[cardId] = false;
      });
  },
});

export const {
  selectQuestion,
  updateVizSettings,
  applyVizSettings,
  clearVizSettingsUpdates,
  resetReports,
} = reportsSlice.actions;

export const reportsReducer = reportsSlice.reducer;
