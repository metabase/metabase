import { createListenerMiddleware } from "@reduxjs/toolkit";

import { userApi } from "metabase/api/user";
import type { State } from "metabase/redux/store";

import { storeTemporaryPassword } from "./people";

export const peopleListenerMiddleware = createListenerMiddleware<State>();

peopleListenerMiddleware.startListening({
  matcher: userApi.endpoints.createUser.matchFulfilled,
  effect: (action, { dispatch }) => {
    const { password } = action.meta.arg.originalArgs;
    if (password) {
      dispatch(storeTemporaryPassword({ id: action.payload.id, password }));
    }
  },
});

peopleListenerMiddleware.startListening({
  matcher: userApi.endpoints.updatePassword.matchFulfilled,
  effect: (action, { dispatch }) => {
    const { id, password } = action.meta.arg.originalArgs;
    dispatch(storeTemporaryPassword({ id, password }));
  },
});
