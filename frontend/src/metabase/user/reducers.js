import { handleActions } from "redux-actions";

import { CHANGE_TAB, UPDATE_PASSWORD, UPDATE_USER } from "./actions";

export const tab = handleActions(
  {
    [CHANGE_TAB]: { next: (state, { payload }) => payload },
  },
  "details",
);

export const updatePasswordResult = handleActions(
  {
    [CHANGE_TAB]: { next: (state, { payload }) => null },
    [UPDATE_PASSWORD]: { next: (state, { payload }) => payload },
  },
  null,
);

export const updateUserResult = handleActions(
  {
    [CHANGE_TAB]: { next: (state, { payload }) => null },
    [UPDATE_USER]: { next: (state, { payload }) => payload },
  },
  null,
);
