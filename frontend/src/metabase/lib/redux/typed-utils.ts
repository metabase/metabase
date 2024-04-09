import { createAsyncThunk as createAsyncThunkOriginal } from "@reduxjs/toolkit";

import type { State, Dispatch, GetState } from "metabase-types/store";

import { withAction } from "./utils";

interface ThunkConfig {
  state: State;
}

export const createAsyncThunk =
  createAsyncThunkOriginal.withTypes<ThunkConfig>();

// similar to createAction but accepts a (redux-thunk style) thunk and dispatches based on whether
// the promise returned from the thunk resolves or rejects, similar to redux-promise
export function createThunkAction<TArgs extends any[]>(
  actionType: string,
  thunkCreator: (
    ...args: TArgs
  ) => (dispatch: Dispatch, getState: GetState) => any,
): (...args: TArgs) => any {
  return withAction(actionType)(thunkCreator);
}
