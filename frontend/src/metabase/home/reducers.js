import { handleActions } from "redux-actions";

import { FETCH_ACTIVITY, FETCH_RECENT_VIEWS } from "./actions";

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
