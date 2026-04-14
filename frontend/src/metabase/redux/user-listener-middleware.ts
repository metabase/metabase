import { createListenerMiddleware } from "@reduxjs/toolkit";

import { userApi } from "metabase/api/user";
import type { State } from "metabase/redux/store";

import { userUpdated } from "./user";

export const userListenerMiddleware = createListenerMiddleware<State>();

userListenerMiddleware.startListening({
  matcher: userApi.endpoints.updateUser.matchFulfilled,
  effect: (action, { dispatch }) => {
    dispatch(userUpdated(action.payload));
  },
});
