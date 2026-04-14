import { createListenerMiddleware } from "@reduxjs/toolkit";

import { sessionApi } from "metabase/api/session";
import type { State } from "metabase/redux/store";

import { loadSettings } from "./settings";

export const sessionListenerMiddleware = createListenerMiddleware<State>();

sessionListenerMiddleware.startListening({
  matcher: sessionApi.endpoints.getSessionProperties.matchFulfilled,
  effect: (action, { dispatch }) => {
    dispatch(loadSettings(action.payload));
  },
});
