/* @flow weak */

import { handleActions, createAction } from "metabase/lib/redux";
import { getIn, assocIn } from "icepick";
import { combineReducers } from "redux";

export const SET_REQUEST_STATE = "metabase/requests/SET_REQUEST_STATE";
const CLEAR_REQUEST_STATE = "metabase/requests/CLEAR_REQUEST_STATE";

export const setRequestState = createAction(SET_REQUEST_STATE);
export const clearRequestState = createAction(CLEAR_REQUEST_STATE);

// e.x. for statePath ["a", "b", "fetch"]
//
// {
//   states: {
//     a: {
//       b: {
//         fetch: {
//           state: "LOADING"|"LOADED",
//           error: ...
//         }
//       }
//     }
//   }
//   fetched: {
//     a: {
//       b: true
//     }
//   }
// }

// For a given state path, returns the current request state ("LOADING", "LOADED" or a request error)
export const states = handleActions(
  {
    [SET_REQUEST_STATE]: {
      next: (state, { payload }) =>
        assocIn(state, payload.statePath, {
          state: payload.state,
          error: payload.error,
        }),
    },
    [CLEAR_REQUEST_STATE]: {
      next: (state, { payload }) =>
        assocIn(state, payload.statePath, undefined),
    },
  },
  {},
);

// For given state path, returns true if the data has been successfully fetched at least once
export const fetched = handleActions(
  {
    [SET_REQUEST_STATE]: {
      next: (state, { payload }) => {
        const isFetch =
          payload.statePath[payload.statePath.length - 1] === "fetch";

        if (isFetch) {
          const statePathWithoutFetch = payload.statePath.slice(0, -1);
          return assocIn(
            state,
            statePathWithoutFetch,
            getIn(state, statePathWithoutFetch) || payload.state === "LOADED",
          );
        } else {
          return state;
        }
      },
    },
  },
  {},
);

export default combineReducers({ states, fetched });
