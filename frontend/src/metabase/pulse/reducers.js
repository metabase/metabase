import { handleActions } from "redux-actions";

import {
  SET_EDITING_PULSE,
  UPDATE_EDITING_PULSE,
  SAVE_EDITING_PULSE,
  FETCH_PULSE_FORM_INPUT,
  FETCH_PULSE_CARD_PREVIEW,
} from "./actions";

export const editingPulse = handleActions(
  {
    [SET_EDITING_PULSE]: { next: (state, { payload }) => payload },
    [UPDATE_EDITING_PULSE]: { next: (state, { payload }) => payload },
    [SAVE_EDITING_PULSE]: { next: (state, { payload }) => payload },
  },
  { name: null, cards: [], channels: [] },
);

export const formInput = handleActions(
  {
    [FETCH_PULSE_FORM_INPUT]: { next: (state, { payload }) => payload },
  },
  {},
);

export const cardPreviews = handleActions(
  {
    [FETCH_PULSE_CARD_PREVIEW]: {
      next: (state, { payload }) => ({ ...state, [payload.id]: payload }),
    },
  },
  {},
);
