import { useEffect, useReducer } from "react";
import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import { fetchParameterValues } from "metabase/parameters/actions";
import type { Parameter } from "metabase-types/api";

import { ListPicker } from "./ListPicker";
import { getFlatValueList, getListParameterStaticValues } from "./core";
import { useDebouncedCallback } from "metabase/hooks/use-debounced-callback";
import { getDefaultState, getResetKey, reducer } from "./listPickerState";

interface ListPickerConnectedProps {
  value: string;
  parameter: Parameter;
  onChange: (value: string | null) => void;
  forceSearchItemCount: number;
  searchDebounceMs?: number;
}

// TODO should we fetch initially?
// TODO fetching errors
// TODO clearing doesn't work on first try
// TODO null value or different value in search URL
export function ListPickerConnected(props: ListPickerConnectedProps) {
  const globalDispatch = useDispatch();
  const {
    value,
    parameter,
    onChange,
    forceSearchItemCount,
    searchDebounceMs = 150,
  } = props;

  const [{ values, hasMoreValues, isLoading, lastSearch, resetKey }, dispatch] =
    useReducer(reducer, getDefaultState(value));

  const fetchAndSaveValuesDebounced = useDebouncedCallback(
    async (query: string) => {
      const res = await globalDispatch(
        fetchParameterValues({ parameter, query }),
      );

      dispatch({
        type: "SET_LOADED",
        payload: {
          values: getFlatValueList(res.values as string[][]),
          hasMore: res.has_more_values,
          resetKey: getResetKey(parameter),
          searchQuery: query,
        },
      });
    },
    searchDebounceMs,
    [dispatch, globalDispatch, fetchParameterValues, parameter],
  );

  const cancelFetching = () => {
    fetchAndSaveValuesDebounced.cancel();
    dispatch({ type: "SET_IS_LOADING", payload: { isLoading: false } });
  };

  const ownOnSearch = (query: string) => {
    if (hasMoreValues) {
      const trimmed = query.trim();
      // We have to trigger fetch only when search is different from the current value
      if (trimmed !== lastSearch) {
        // console.log(`search trimmed="${trimmed}" value="${lastSearch}"`);
        fetchAndSaveValuesDebounced.cancel();
        dispatch({ type: "SET_IS_LOADING", payload: { isLoading: true } });
        fetchAndSaveValuesDebounced(query);
      }
    }
  };

  const ownOnChange = (value: string | null) => {
    cancelFetching();
    onChange(value);
  };

  const ownOnClear = () => {
    cancelFetching();
    onChange(null);
  };

  // Reset when parameter changes
  useEffect(() => {
    // null means we render for the first tima and state shouldn't be reset
    if (resetKey !== null && resetKey !== getResetKey(parameter)) {
      dispatch({ type: "RESET" });
      ownOnClear();
    }
  }, [resetKey, parameter]);
  // Cleanup
  useEffect(() => () => cancelFetching(), []);

  const staticValues = getListParameterStaticValues(parameter);
  const enableSearch =
    !staticValues || staticValues.length > forceSearchItemCount;

  return (
    <ListPicker
      value={value}
      values={staticValues ?? values}
      onClear={ownOnClear}
      onChange={ownOnChange}
      onSearchChange={staticValues ? undefined : ownOnSearch}
      enableSearch={enableSearch}
      placeholder={
        enableSearch ? t`Start typing to filter…` : t`Select a default value…`
      }
      isLoading={isLoading}
      noResultsText={isLoading ? t`Loading…` : t`No matching result`}
    />
  );
}
