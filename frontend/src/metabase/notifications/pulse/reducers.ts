import { handleActions } from "redux-actions";

import type {
  ChannelApiResponse,
  DashboardSubscription,
} from "metabase-types/api";
import type { DraftDashboardSubscription } from "metabase-types/store";

import {
  CANCEL_EDITING_PULSE,
  FETCH_PULSE_CARD_PREVIEW,
  FETCH_PULSE_FORM_INPUT,
  FETCH_PULSE_LIST_BY_DASHBOARD_ID,
  SAVE_EDITING_PULSE,
  SET_EDITING_PULSE,
  UPDATE_EDITING_PULSE,
} from "./actions";

const DEFAULT_EDITING_PULSE: DraftDashboardSubscription = {
  cards: [],
  channels: [],
};

export const editingPulse = handleActions<
  DraftDashboardSubscription,
  DraftDashboardSubscription
>(
  {
    [SET_EDITING_PULSE]: {
      next: (_state, { payload }) => payload,
    },
    [UPDATE_EDITING_PULSE]: {
      next: (_state, { payload }) => payload,
    },
    [SAVE_EDITING_PULSE]: {
      next: (_state, { payload }) => payload,
    },
    [CANCEL_EDITING_PULSE]: {
      next: () => DEFAULT_EDITING_PULSE,
    },
  },
  DEFAULT_EDITING_PULSE,
);

export const formInput = handleActions(
  {
    [FETCH_PULSE_FORM_INPUT]: {
      next: (
        _state: ChannelApiResponse,
        { payload }: { payload: ChannelApiResponse },
      ) => payload,
    },
  },
  {} as ChannelApiResponse,
);

type CardPreviewEntry = { id: number };
type CardPreviewsState = Record<number, CardPreviewEntry>;

export const cardPreviews = handleActions(
  {
    [FETCH_PULSE_CARD_PREVIEW]: {
      next: (
        state: CardPreviewsState,
        { payload }: { payload: CardPreviewEntry },
      ) => ({
        ...state,
        [payload.id]: payload,
      }),
    },
  },
  {} as CardPreviewsState,
);

export const pulseList = handleActions(
  {
    [FETCH_PULSE_LIST_BY_DASHBOARD_ID]: {
      next: (
        _state: DashboardSubscription[],
        { payload }: { payload: DashboardSubscription[] },
      ) => payload,
    },
  },
  [] as DashboardSubscription[],
);
