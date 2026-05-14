import {
  type ThunkDispatch,
  createAsyncThunk as createAsyncThunkOriginal,
} from "@reduxjs/toolkit";

import type { Dispatch, GetState, State } from "metabase/redux/store";

export { combineReducers, compose } from "@reduxjs/toolkit";
export { handleActions, createAction } from "redux-actions";

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
  return withAction<TActionType, TArgs>(actionType)(thunkCreator);
}

type Thunk<R = unknown> = (
  dispatch: Dispatch,
  getState: () => State,
) => Promise<R> | R;

type PayloadOrThunkCreator<TArgs extends unknown[], R = unknown> = (
  ...args: TArgs
) => R | Thunk<R>;

/**
 * Decorator for turning a payload creator or thunk (including one returning a promise) into a flux standard action
 */
export function withAction<TArgs extends unknown[]>(actionType: string) {
  return (payloadOrThunkCreator: PayloadOrThunkCreator<TArgs>) => {
    function newCreator(...args: TArgs): unknown {
      const payloadOrThunk = payloadOrThunkCreator(...args);
      if (typeof payloadOrThunk === "function") {
        // thunk, return a new thunk
        return async (dispatch: Dispatch, getState: () => State) => {
          try {
            const payload = await (payloadOrThunk as Thunk)(dispatch, getState);
            const dispatchValue = { type: actionType, payload: payload };
            dispatch(dispatchValue);

            return dispatchValue;
          } catch (error) {
            dispatch({ type: actionType, payload: error, error: true });
            throw error;
          }
        };
      } else {
        // payload, return an action
        return { type: actionType, payload: payloadOrThunk };
      }
    }
    newCreator.toString = () => actionType;
    return newCreator;
  };
}
