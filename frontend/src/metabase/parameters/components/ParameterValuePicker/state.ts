import type { Parameter } from "metabase-types/api";

import { isStaticListParam } from "./core";

type Action =
  | {
      type: "SET_IS_LOADING";
      payload: { isLoading: boolean; query?: string };
    }
  | {
      type: "SET_VALUES";
      payload: {
        values: string[];
        hasMore: boolean;
        resetKey: string;
      };
    }
  | { type: "SET_LAST_CHANGE"; payload: { value: string | null } }
  | { type: "SET_ERROR"; payload: { msg: string } }
  | { type: "SET_RESET_KEY"; payload: { key: string } }
  | { type: "RESET"; payload: { newResetKey: string } };

interface State {
  values: string[];
  hasFetchedValues: boolean;
  hasMoreValues: boolean;
  isLoading: boolean;
  resetKey: string;
  searchQuery: string;
  lastValue: string | null;
  errorMsg?: string;
}

export function getDefaultState(
  initialValue: string | null,
  resetKey: string,
): State {
  return {
    // This is needed for Select to show it initially
    values: initialValue ? [initialValue] : [],
    hasFetchedValues: false,
    hasMoreValues: true,
    isLoading: false,
    resetKey,
    searchQuery: initialValue ?? "",
    lastValue: initialValue ?? null,
  };
}

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "SET_IS_LOADING":
      return {
        ...state,
        isLoading: action.payload.isLoading,
        searchQuery: action.payload.query ?? state.searchQuery,
        errorMsg: undefined,
      };

    case "SET_VALUES":
      return {
        ...state,
        values: action.payload.values,
        hasMoreValues: action.payload.hasMore,
        hasFetchedValues: true,
        isLoading: false,
        resetKey: action.payload.resetKey,
        errorMsg: undefined,
      };

    case "SET_LAST_CHANGE":
      return {
        ...state,
        lastValue: action.payload.value,
      };

    case "SET_RESET_KEY":
      return {
        ...state,
        resetKey: action.payload.key,
      };

    case "SET_ERROR":
      return {
        ...state,
        isLoading: false,
        errorMsg: action.payload.msg,
      };

    case "RESET":
      return {
        values: [],
        hasFetchedValues: false,
        hasMoreValues: true,
        isLoading: false,
        resetKey: action.payload.newResetKey,
        searchQuery: "",
        lastValue: "",
      };
  }
}

export function getResetKey(parameter: Parameter): string {
  return JSON.stringify([
    parameter.values_source_config,
    parameter.values_source_type,
  ]);
}

export function shouldFetchInitially(state: State, parameter: Parameter) {
  return !isStaticListParam(parameter) && !state.hasFetchedValues;
}

export function shouldFetchOnSearch(
  state: State,
  parameter: Parameter,
  query: string,
) {
  return (
    !isStaticListParam(parameter) &&
    state.hasMoreValues &&
    query !== state.searchQuery &&
    // WARNING! Beacuse Mantine's Select fires onSearchChange as crazy, we have to save
    // lastValue and prevent fetching when query is the same, which will reset the previously
    // visible values.
    (query === null || query !== state.lastValue)
  );
}

export function shouldReset(state: State, newResetKey: string) {
  return state.resetKey !== newResetKey;
}
