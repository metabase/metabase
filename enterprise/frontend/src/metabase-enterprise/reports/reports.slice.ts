import { type PayloadAction, createSlice } from "@reduxjs/toolkit";

import { cardApi } from "metabase/api";
import { createAsyncThunk } from "metabase/lib/redux";
import { reportApi } from "metabase-enterprise/api";
import type {
  Card,
  CardDisplayType,
  CardId,
  Dataset,
  VisualizationSettings,
} from "metabase-types/api";

export interface QuestionRef {
  id: number;
  name?: string;
  snapshotId?: number;
}

export interface ReportsState {
  cards: Record<CardId, Card>;
  datasets: Record<number, Dataset>;
  loadingCards: Record<CardId, boolean>;
  loadingDatasets: Record<number, boolean>;
  selectedQuestionId: CardId | null;
  isSidebarOpen: boolean;
  modifiedVisualizationSettings: Record<CardId, boolean>;
  questionRefs: QuestionRef[];
}

const initialState: ReportsState = {
  cards: {},
  datasets: {},
  loadingCards: {},
  loadingDatasets: {},
  selectedQuestionId: null,
  isSidebarOpen: false,
  modifiedVisualizationSettings: {},
  questionRefs: [],
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

export const fetchReportSnapshot = createAsyncThunk<Dataset, number>(
  "reports/fetchSnapshot",
  async (snapshotId, { dispatch }) => {
    const result = await dispatch(
      reportApi.endpoints.getReportSnapshot.initiate(snapshotId),
    );
    if (result.data != null) {
      return result.data;
    }
    throw new Error("Failed to fetch snapshot");
  },
);

export const fetchReportQuestionData = createAsyncThunk<
  { card: Card; dataset: Dataset },
  { cardId: CardId; snapshotId: number }
>(
  "reports/fetchQuestionData",
  async ({ cardId, snapshotId }, { dispatch, getState, rejectWithValue }) => {
    const state = getState() as any;
    const existingCard = state.plugins?.reports?.cards[cardId];
    const existingDataset = state.plugins?.reports?.datasets[snapshotId];

    const promises = [];
    if (!existingCard) {
      promises.push(dispatch(fetchReportCard(cardId)));
    }
    if (!existingDataset) {
      promises.push(dispatch(fetchReportSnapshot(snapshotId)));
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
      finalState.plugins?.reports?.datasets[snapshotId] || existingDataset;

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
    selectQuestion: (state, action: PayloadAction<CardId | null>) => {
      state.selectedQuestionId = action.payload;
    },
    openVizSettingsSidebar: (state, action: PayloadAction<CardId>) => {
      state.selectedQuestionId = action.payload;
      state.isSidebarOpen = true;
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
      if (state.cards[cardId]) {
        state.cards[cardId] = {
          ...state.cards[cardId],
          visualization_settings: {
            ...state.cards[cardId].visualization_settings,
            ...settings,
          },
        };
        state.modifiedVisualizationSettings[cardId] = true;
      }
    },
    updateVisualizationType: (
      state,
      action: PayloadAction<{ cardId: CardId; display: CardDisplayType }>,
    ) => {
      const { cardId, display } = action.payload;
      if (state.cards[cardId]) {
        state.cards[cardId] = {
          ...state.cards[cardId],
          display,
        };
        state.modifiedVisualizationSettings[cardId] = true;
      }
    },
    clearModifiedVisualizationSettings: (
      state,
      action: PayloadAction<CardId>,
    ) => {
      delete state.modifiedVisualizationSettings[action.payload];
    },
    setQuestionRefs: (state, action: PayloadAction<QuestionRef[]>) => {
      state.questionRefs = action.payload;
    },
    updateQuestionRef: (
      state,
      action: PayloadAction<{ questionId: CardId; snapshotId: number }>,
    ) => {
      const { questionId, snapshotId } = action.payload;
      const index = state.questionRefs.findIndex(
        (ref) => ref.id === questionId,
      );
      if (index !== -1) {
        state.questionRefs[index] = {
          ...state.questionRefs[index],
          snapshotId,
        };
      }
    },
    updateQuestionRefs: (
      state,
      action: PayloadAction<Array<{ questionId: CardId; snapshotId: number }>>,
    ) => {
      action.payload.forEach(({ questionId, snapshotId }) => {
        const index = state.questionRefs.findIndex(
          (ref) => ref.id === questionId,
        );
        if (index !== -1) {
          state.questionRefs[index] = {
            ...state.questionRefs[index],
            snapshotId,
          };
        }
      });
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
      .addCase(fetchReportSnapshot.pending, (state, action) => {
        state.loadingDatasets[action.meta.arg] = true;
      })
      .addCase(fetchReportSnapshot.fulfilled, (state, action) => {
        const dataset = action.payload;
        const snapshotId = action.meta.arg;
        state.datasets[snapshotId] = dataset;
        state.loadingDatasets[snapshotId] = false;
      })
      .addCase(fetchReportSnapshot.rejected, (state, action) => {
        state.loadingDatasets[action.meta.arg] = false;
      })
      .addCase(fetchReportQuestionData.pending, (state, action) => {
        const { cardId, snapshotId } = action.meta.arg;
        if (!state.cards[cardId]) {
          state.loadingCards[cardId] = true;
        }
        if (!state.datasets[snapshotId]) {
          state.loadingDatasets[snapshotId] = true;
        }
      })
      .addCase(fetchReportQuestionData.fulfilled, (state, action) => {
        const { card, dataset } = action.payload;
        const { snapshotId } = action.meta.arg;

        state.cards[card.id] = card;
        state.datasets[snapshotId] = dataset;
        state.loadingCards[card.id] = false;
        state.loadingDatasets[snapshotId] = false;
      })
      .addCase(fetchReportQuestionData.rejected, (state, action) => {
        const { cardId, snapshotId } = action.meta.arg;
        state.loadingCards[cardId] = false;
        state.loadingDatasets[snapshotId] = false;
      });
  },
});

export const {
  selectQuestion,
  openVizSettingsSidebar,
  toggleSidebar,
  setSidebarOpen,
  updateVizSettings,
  updateVisualizationType,
  clearModifiedVisualizationSettings,
  setQuestionRefs,
  updateQuestionRef,
  updateQuestionRefs,
  resetReports,
} = reportsSlice.actions;

export const reportsReducer = reportsSlice.reducer;
