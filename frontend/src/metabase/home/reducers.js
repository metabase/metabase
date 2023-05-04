import { handleActions } from "redux-actions";

import {
  FETCH_ACTIVITY,
  FETCH_RECENT_VIEWS,
  SET_LAST_SEEN_COLLECTION,
} from "./actions";

export const activity = handleActions(
  {
    [FETCH_ACTIVITY]: { next: (state, { payload }) => payload },
  },
  null,
);

export const recentViews = handleActions(
  {
    [FETCH_RECENT_VIEWS]: { next: (state, { payload }) => payload },
  },
  [],
);

export const lastSeenCollection = handleActions(
  {
    [SET_LAST_SEEN_COLLECTION]: { next: (state, { payload }) => payload },
  },
  null,
);
