/* @flow */

// "Flux standard action" style redux action
export type ReduxAction =
  | { type: string, payload?: any, error?: boolean }
  | ReduxActionThunk;

export type ReduxActionThunk = (
  dispatch: (action: ReduxAction) => void,
  getState: () => Object,
) => void;
