import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useAsync, useUnmount } from "react-use";
import { t } from "ttag";

import type { Parameter, ParameterValues } from "metabase-types/api";

import { ListPicker } from "../ListPicker";
import {
  getFlattenedStrings,
  getListParameterStaticValues,
  shouldEnableSearch,
} from "../core";

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

  const lastValue = useRef(value);
  const hasMoreValues = useRef(true);
  const [searchQuery, setSearchQuery] = useState("");

  const {
    loading,
    value: loadedValues,
    error,
  } = useAsync(async () => {
    const res = await fetchValues(searchQuery);
    hasMoreValues.current = res.has_more_values;
    return getFlattenedStrings(res.values);
  }, [fetchValues, searchQuery]);

  console.log(
    `hasMore=${hasMoreValues.current} query=${searchQuery}, loading=${loading}, values.length=${loadedValues?.length}`,
  );

  const searchWhenNeeded = useCallback((query: string) => {
    if (hasMoreValues.current && lastValue.current !== query) {
      setSearchQuery(query);
    }
  }, []);

  const setValue = useCallback(
    (value: string | null) => {
      lastValue.current = value;
      onChange(value);
    },
    [onChange],
  );

  // const ownOnSearch = useCallback(
  //   (query: string) => {
  //     // Trigger fetch only when search is different from the current value
  //     if (shouldFetchOnSearch(state, parameter, query)) {
  //       setSearchQuery(query);
  //       // dispatch({
  //       //   type: "SET_IS_LOADING",
  //       //   payload: { isLoading: true, query },
  //       // });
  //       // fetchAndUpdate(query);
  //     }
  //   },
  //   [parameter, state],
  // );

  // useEffect(
  //   function resetOnParameterChange() {
  //     const newResetKey = getResetKey(parameter);
  //     if (resetKey !== newResetKey) {
  //       dispatch({ type: "RESET", payload: { newResetKey } });
  //       onChange(null);
  //     }
  //   },
  //   [resetKey, parameter, onChange],
  // );
  // useUnmount(() =>
  //   dispatch({ type: "SET_IS_LOADING", payload: { isLoading: false } }),
  // ); // Cleanup

  const staticValues = getListParameterStaticValues(parameter);
  const enableSearch = shouldEnableSearch(parameter, forceSearchItemCount);

  // const fetchValuesInit = useCallback(() => {
  //   if (shouldFetchInitially(state, parameter)) {
  //     dispatch({
  //       type: "SET_IS_LOADING",
  //       payload: { isLoading: true, query: "" },
  //     });
  //     fetchAndUpdate("");
  //   }
  // }, [parameter, state, fetchAndUpdate]);

  const isLoading = !staticValues && loading;

  return (
    <ListPicker
      value={value ?? ""} // Can't be null for the underlying Select
      // value={""} // Can't be null for the underlying Select
      values={staticValues ?? loadedValues ?? []}
      // values={[]}
      onClear={() => setValue(null)}
      onChange={setValue}
      onSearchChange={searchWhenNeeded}
      searchDebounceMs={searchDebounceMs}
      // onDropdownOpen={staticValues ? undefined : fetchValuesInit}
      enableSearch={enableSearch}
      placeholder={
        enableSearch ? t`Start typing to filter…` : t`Select a default value…`
      }
      isLoading={isLoading}
      noResultsText={isLoading ? t`Loading…` : t`No matching result`}
      errorMessage={
        error ? t`Loading values failed. Please try again shortly.` : undefined
      }
    />
  );
}

function getResetKey(parameter: Parameter): string {
  return JSON.stringify([
    parameter.values_source_config,
    parameter.values_source_type,
  ]);
}
