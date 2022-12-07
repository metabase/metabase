/**
 * ⚠️
 * @deprecated use existing types from, or add to metabase-types/api/*
 */

// "Flux standard action" style redux action
export type ReduxAction =
  | { type: string; payload?: any; error?: boolean }
  | ReduxActionThunk;

export type ReduxActionThunk = (
  dispatch: (action: ReduxAction) => void,
  getState: () => any,
) => void;
