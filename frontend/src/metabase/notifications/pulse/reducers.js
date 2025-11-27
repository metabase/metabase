import { handleActions } from "redux-actions";

import {
  CANCEL_EDITING_PULSE,
  SAVE_EDITING_PULSE,
  SET_EDITING_PULSE,
  UPDATE_EDITING_PULSE,
} from "./actions";

const DEFAULT_EDITING_PULSE = { name: null, cards: [], channels: [] };

export const editingPulse = handleActions(
  {
    [SET_EDITING_PULSE]: { next: (state, { payload }) => payload },
    [UPDATE_EDITING_PULSE]: { next: (state, { payload }) => payload },
    [SAVE_EDITING_PULSE]: { next: (state, { payload }) => payload },
    [CANCEL_EDITING_PULSE]: { next: () => DEFAULT_EDITING_PULSE },
  },
  DEFAULT_EDITING_PULSE,
);
