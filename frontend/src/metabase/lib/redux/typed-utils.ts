import type { ThunkDispatch } from "@reduxjs/toolkit";
import { createAsyncThunk as createAsyncThunkOriginal } from "@reduxjs/toolkit";

import type { State, GetState } from "metabase-types/store";

import { withAction } from "./utils";

interface ThunkConfig {
  state: State;
}

export const createAsyncThunk =
  createAsyncThunkOriginal.withTypes<ThunkConfig>();

// similar to createAction but accepts a (redux-thunk style) thunk and dispatches based on whether
// the promise returned from the thunk resolves or rejects, similar to redux-promise
export function createThunkAction<
  TArgs extends any[],
  TResult,
  TActionType extends string,
>(
  actionType: TActionType,
  thunkCreator: (
    ...args: TArgs
  ) => (dispatch: ThunkDispatch<any, any, any>, getState: GetState) => TResult,
): (
  ...args: TArgs
) => (
  dispatch: ThunkDispatch<any, any, any>,
  getState: GetState,
) => Promise<{ type: TActionType; payload: Awaited<TResult> }> {
  // @ts-expect-error - withAction is too hard to type correctly as it can accept both the payload or a thunk creator
  // this function only uses it with a thunk creator
  return withAction(actionType)(thunkCreator);
}
