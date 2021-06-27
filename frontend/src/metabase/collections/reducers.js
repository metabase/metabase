import { assoc } from "icepick";
import { handleActions } from "redux-actions";

import { SET_OPEN_COLLECTIONS } from "./actions";

const initialState = {
  openCollections: [],
};

export default handleActions(
  {
    [SET_OPEN_COLLECTIONS]: {
      next: (state, { payload }) => assoc(state, "openCollections", payload),
    },
  },
  initialState,
);
