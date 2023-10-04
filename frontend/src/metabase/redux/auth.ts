import { createReducer } from "@reduxjs/toolkit";

import { login, loginGoogle } from "metabase/auth/actions";

const initialState = {
  loginPending: false,
};

export const reducer = createReducer(initialState, builder => {
  builder.addCase(login.pending, state => {
    state.loginPending = true;
  });
  builder.addCase(login.fulfilled, state => {
    state.loginPending = false;
  });

  builder.addCase(loginGoogle.pending, state => {
    state.loginPending = true;
  });
  builder.addCase(loginGoogle.fulfilled, state => {
    state.loginPending = false;
  });
});
