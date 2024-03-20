import { useCallback, useEffect, useRef } from "react";
import { useAsyncFn } from "react-use";
import { t } from "ttag";

import type { Parameter, ParameterValues } from "metabase-types/api";

import { ListPicker } from "../ListPicker";
import {
  getFlattenedStrings,
  getListParameterStaticValues,
  isStaticListParam,
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

  const hasFetched = useRef(false);
  const lastValue = useRef(value);
  const lastSearch = useRef("");
  const hasMoreValues = useRef(true);
  const resetKey = useRef<string | null>(getResetKey(parameter));

  const [
    { loading: isFetching, value: fetchedValues, ...fetchState },
    fetchData,
  ] = useAsyncFn(
    async (query: string) => {
      const res = await fetchValues(query);
      hasFetched.current = true;
      hasMoreValues.current = res.has_more_values;
      return getFlattenedStrings(res.values);
    },
    [fetchValues],
  );

  const setValue = useCallback(
    (value: string | null) => {
      lastValue.current = value;
      onChange(value);
    },
    [onChange],
  );

  const ownOnSearch = useCallback(
    (query: string) => {
      // Trigger fetch only when search is different from the current value
      const shouldFetch =
        !isStaticListParam(parameter) &&
        hasMoreValues.current &&
        lastSearch.current !== query;

      // const err = new Error();
      // console.log(
      //   `onSearch: query=${query}, lastSearch=${lastSearch.current}, hasMoreValues=${hasMoreValues.current}`,
      // );
      // console.log(err.stack);

      if (shouldFetch) {
        lastSearch.current = query;
        fetchData(query);
      }
    },
    [parameter, fetchData],
  );

  useEffect(
    function resetOnParameterChange() {
      const newResetKey = getResetKey(parameter);
      if (resetKey.current !== newResetKey) {
        // console.log("yea", lastValue.current);
        resetKey.current = newResetKey;
        if (lastValue.current !== null) {
          onChange(null);
          lastValue.current = null;
        }
      }
    },
    [resetKey, parameter, onChange],
  );

  const staticValues = getListParameterStaticValues(parameter);
  const enableSearch = shouldEnableSearch(parameter, forceSearchItemCount);

  const fetchValuesInit = useCallback(() => {
    const shouldFetch = !isStaticListParam(parameter) && !hasFetched.current;
    if (shouldFetch) {
      lastSearch.current = "";
      fetchData("");
    }
  }, [parameter, fetchData]);

  const isLoading = !staticValues && isFetching;
  // useAsyncFn might return {error: undefined}
  const hasFetchError = "error" in fetchState;

  return (
    <ListPicker
      value={value ?? ""} // Can't be null for the underlying Select
      values={staticValues ?? fetchedValues ?? []}
      onClear={() => setValue(null)}
      onChange={setValue}
      onSearchChange={ownOnSearch}
      searchDebounceMs={searchDebounceMs}
      onDropdownOpen={staticValues ? undefined : fetchValuesInit}
      enableSearch={enableSearch}
      placeholder={
        enableSearch ? t`Start typing to filter…` : t`Select a default value…`
      }
      isLoading={isLoading}
      noResultsText={isLoading ? t`Loading…` : t`No matching result`}
      errorMessage={
        hasFetchError
          ? t`Loading values failed. Please try again shortly.`
          : undefined
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
