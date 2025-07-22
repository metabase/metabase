import { type PayloadAction, createSlice } from "@reduxjs/toolkit";

import { cardApi } from "metabase/api";
import { createAsyncThunk } from "metabase/lib/redux";
import type {
  Card,
  CardDisplayType,
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
  isSidebarOpen: boolean;
}

const initialState: ReportsState = {
  cards: {},
  datasets: {},
  loadingCards: {},
  loadingDatasets: {},
  selectedQuestionId: null,
  isSidebarOpen: false,
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
      // Only auto-open sidebar when selecting a question, not when deselecting
      if (action.payload !== null) {
        state.isSidebarOpen = true;
      }
    },
    toggleSidebar: (state) => {
      state.isSidebarOpen = !state.isSidebarOpen;
    },
    setSidebarOpen: (state, action: PayloadAction<boolean>) => {
      state.isSidebarOpen = action.payload;
    },
    updateVizSettings: (
      state,
      action: PayloadAction<{
        cardId: CardId;
        settings: VisualizationSettings;
      }>,
    ) => {
      const { cardId, settings } = action.payload;
      // Directly update the card's visualization settings
      if (state.cards[cardId]) {
        state.cards[cardId] = {
          ...state.cards[cardId],
          visualization_settings: {
            ...state.cards[cardId].visualization_settings,
            ...settings,
          },
        };
      }
    },
    updateVisualizationType: (
      state,
      action: PayloadAction<{
        cardId: CardId;
        display: CardDisplayType;
      }>,
    ) => {
      const { cardId, display } = action.payload;
      if (state.cards[cardId]) {
        state.cards[cardId] = {
          ...state.cards[cardId],
          display,
        };
      }
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
        // Preserve existing visualization settings if we already have them
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
        // Preserve existing visualization settings if we already have them
        const existingCard = state.cards[card.id];
        if (existingCard?.visualization_settings) {
          card.visualization_settings = {
            ...card.visualization_settings,
            ...existingCard.visualization_settings,
          };
        }
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
  toggleSidebar,
  setSidebarOpen,
  updateVizSettings,
  updateVisualizationType,
  resetReports,
} = reportsSlice.actions;

export const reportsReducer = reportsSlice.reducer;
