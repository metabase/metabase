/* @flow weak */

import { handleActions, createAction } from "metabase/lib/redux";
import { updateIn } from "icepick";

export const SET_REQUEST_STATE = "metabase/requests/SET_REQUEST_STATE";
export const CLEAR_REQUEST_STATE = "metabase/requests/CLEAR_REQUEST_STATE";

export const setRequestState = createAction(SET_REQUEST_STATE);
export const clearRequestState = createAction(CLEAR_REQUEST_STATE);

// e.x. for statePath ["a", "b", "fetch"]
//
// {
//     a: {
//       b: {
//         fetch: {
//           state: "LOADING"|"LOADED",
//           error: ...
//           fetched: true
//         }
//       }
//     }
// }

// For a given state path, returns the current request state ("LOADING", "LOADED" or a request error)
export default handleActions(
  {
    [SET_REQUEST_STATE]: {
      next: (state, { payload }) =>
        updateIn(state, payload.statePath, (previous = {}) => ({
          ...previous,
          fetched: previous.fetched || payload.state === "LOADED",
          state: payload.state,
          error: payload.error,
        })),
    },
    [CLEAR_REQUEST_STATE]: {
      next: (state, { payload }) =>
        updateIn(state, payload.statePath, (previous = {}) => ({
          ...previous,
          state: null,
          error: false,
        })),
    },
  },
  {},
);
