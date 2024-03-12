import type { Parameter } from "metabase-types/api";

type Action =
  | {
      type: "SET_IS_LOADING";
      payload: { isLoading: boolean; query?: string };
    }
  | {
      type: "SET_LOADED";
      payload: {
        values: string[];
        hasMore: boolean;
        resetKey: string;
      };
    }
  | { type: "SET_ERROR"; payload: { error?: Error; errorMsg: string } }
  | { type: "SET_RESET_KEY"; payload: { key: string } }
  | { type: "RESET" };

interface State {
  values: string[];
  hasMoreValues: boolean;
  isLoading: boolean;
  resetKey: null | string;
  lastSearch: string;
}

export function getDefaultState(initialValue: string | null): State {
  // console.log("getDefaultSearch", initialValue);

  return {
    // This is needed for Select to show it
    values: initialValue === null ? [] : [initialValue],
    hasMoreValues: true,
    isLoading: false,
    resetKey: null,
    lastSearch: "",
  };
}

export function reducer(state: State, action: Action): State {
  // console.log(action);

  switch (action.type) {
    case "SET_IS_LOADING":
      return {
        ...state,
        isLoading: action.payload.isLoading,
        lastSearch: action.payload.query ?? state.lastSearch,
      };

    case "SET_LOADED":
      return {
        ...state,
        values: action.payload.values,
        hasMoreValues: action.payload.hasMore,
        isLoading: false,
        resetKey: action.payload.resetKey,
      };

    case "SET_RESET_KEY":
      return {
        ...state,
        resetKey: action.payload.key,
      };

    // TODO
    case "SET_ERROR":
      return state;

    case "RESET":
      return {
        values: [],
        hasMoreValues: true,
        isLoading: false,
        resetKey: null,
        lastSearch: "",
      };
  }
}

export function getResetKey(parameter: Parameter): string {
  return JSON.stringify([
    parameter.values_source_config,
    parameter.values_source_type,
  ]);
}
