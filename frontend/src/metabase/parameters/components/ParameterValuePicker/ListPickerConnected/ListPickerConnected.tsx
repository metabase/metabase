import { useCallback, useEffect, useReducer } from "react";
import { t } from "ttag";

import { useDebouncedCallback } from "metabase/hooks/use-debounced-callback";
import type { Parameter, ParameterValues } from "metabase-types/api";

import { ListPicker } from "../ListPicker";
import {
  getFlatValueList,
  getListParameterStaticValues,
  shouldEnableSearch,
} from "../core";

import {
  getDefaultState,
  getResetKey,
  reducer,
  shouldFetchInitially,
  shouldFetchOnSearch,
  shouldReset,
} from "./state";

interface ListPickerConnectedProps {
  value: string | null;
  parameter: Parameter;
  onChange: (value: string | null) => void;
  fetchValues: (query: string) => Promise<ParameterValues>;
  forceSearchItemCount: number;
  searchDebounceMs?: number;
}

export function ListPickerConnected(props: ListPickerConnectedProps) {
  const {
    value,
    parameter,
    onChange,
    forceSearchItemCount,
    searchDebounceMs = 150,
    fetchValues,
  } = props;

  const [state, dispatch] = useReducer(
    reducer,
    getDefaultState(value, getResetKey(parameter)),
  );
  const { values: fetchedValues, isLoading, errorMsg } = state;

  const fetchAndUpdate = useCallback(
    async (query: string) => {
      try {
        const res = await fetchValues(query);
        dispatch({
          type: "SET_VALUES",
          payload: {
            values: getFlatValueList(res.values as string[][]),
            hasMore: res.has_more_values,
            resetKey: getResetKey(parameter),
          },
        });
      } catch (e) {
        dispatch({
          type: "SET_ERROR",
          payload: { msg: t`Loading values failed. Please try again shortly.` },
        });
      }
    },
    [fetchValues, dispatch, parameter],
  );

  const fetchUpdateDebounced = useDebouncedCallback(
    fetchAndUpdate,
    searchDebounceMs,
    [fetchAndUpdate],
  );

  const cancelFetch = () => {
    fetchUpdateDebounced.cancel();
    dispatch({ type: "SET_IS_LOADING", payload: { isLoading: false } });
  };

  const ownOnSearch = (query: string) => {
    // Trigger fetch only when search is different from the current value
    if (shouldFetchOnSearch(state, parameter, query)) {
      fetchUpdateDebounced.cancel();
      dispatch({
        type: "SET_IS_LOADING",
        payload: { isLoading: true, query },
      });
      fetchUpdateDebounced(query);
      return;
    }
  };

  const ownOnChange = (value: string | null) => {
    cancelFetch();
    dispatch({ type: "SET_LAST_CHANGE", payload: { value } });
    onChange(value);
  };

  // Reset when parameter changes
  useEffect(() => {
    const newResetKey = getResetKey(parameter);
    if (shouldReset(state, newResetKey)) {
      dispatch({ type: "RESET", payload: { newResetKey } });
      ownOnChange(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, parameter]);
  // Cleanup
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => cancelFetch(), []);

  const staticValues = getListParameterStaticValues(parameter);
  const enableSearch = shouldEnableSearch(parameter, forceSearchItemCount);

  const fetchValuesInit = useCallback(() => {
    if (shouldFetchInitially(state, parameter)) {
      dispatch({
        type: "SET_IS_LOADING",
        payload: { isLoading: true, query: "" },
      });
      fetchAndUpdate("");
    }
  }, [parameter, state, fetchAndUpdate]);

  return (
    <ListPicker
      value={value ?? ""}
      values={staticValues ?? fetchedValues}
      onClear={() => ownOnChange(null)}
      onChange={ownOnChange}
      onSearchChange={ownOnSearch}
      onDropdownOpen={staticValues ? undefined : fetchValuesInit}
      enableSearch={enableSearch}
      placeholder={
        enableSearch ? t`Start typing to filter…` : t`Select a default value…`
      }
      isLoading={isLoading}
      noResultsText={isLoading ? t`Loading…` : t`No matching result`}
      errorMessage={errorMsg}
    />
  );
}
