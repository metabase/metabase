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
  | { type: "SET_ERROR"; payload: { msg: string } }
  | { type: "SET_RESET_KEY"; payload: { key: string } }
  | { type: "RESET"; payload: { newResetKey: string } };

interface State {
  values: string[];
  hasMoreValues: boolean;
  isLoading: boolean;
  resetKey: string;
  lastSearch: string;
  errorMsg?: string;
}

export function getDefaultState(
  initialValue: string | null,
  resetKey: string,
): State {
  return {
    // This is needed for Select to show it
    values: initialValue === null ? [] : [initialValue],
    hasMoreValues: true,
    isLoading: false,
    resetKey,
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
        errorMsg: undefined,
      };

    case "SET_LOADED":
      return {
        ...state,
        values: action.payload.values,
        hasMoreValues: action.payload.hasMore,
        isLoading: false,
        resetKey: action.payload.resetKey,
        errorMsg: undefined,
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
        hasMoreValues: true,
        isLoading: false,
        resetKey: action.payload.newResetKey,
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
