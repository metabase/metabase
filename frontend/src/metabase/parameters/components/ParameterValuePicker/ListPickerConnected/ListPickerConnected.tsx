import { useCallback, useEffect, useState } from "react";
import { useAsync } from "react-use";
import { t } from "ttag";
import { useDebouncedCallback } from "use-debounce";

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

  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [hasMoreValues, setHasMoreValues] = useState(false);
  const [resetKey, setResetKey] = useState(getResetKey(parameter));

  useEffect(
    function resetOnParameterChange() {
      const newResetKey = getResetKey(parameter);
      if (resetKey !== newResetKey) {
        onChange(null);
        setResetKey(newResetKey);
        setIsOpen(false);
        setSearchQuery("");
      }
    },
    [onChange, resetKey, parameter],
  );

  const fetchResult = useAsync(async () => {
    if (isOpen && parameter.values_source_type !== "static-list") {
      const res = await fetchValues(searchQuery);
      setHasMoreValues(res.has_more_values);
      return res.values;
    }
    return undefined;
  }, [
    isOpen,
    searchQuery,
    parameter.values_source_type,
    parameter.values_source_config,
    fetchValues,
  ]);
  const { value: fetchedValues, loading } = fetchResult;

  const handleSearch = useDebouncedCallback(
    useCallback(
      (query: string) => {
        if (hasMoreValues) {
          setSearchQuery(query);
        }
      },
      [hasMoreValues],
    ),
    searchDebounceMs,
  );

  const staticValues = getListParameterStaticValues(parameter);
  const enableSearch = shouldEnableSearch(parameter, forceSearchItemCount);
  const isLoading = loading && !isStaticListParam(parameter);
  const isError = "error" in fetchResult;

  return (
    <ListPicker
      value={value ?? ""} // Can't be null for the underlying Select
      options={getCombinedValues(
        value,
        staticValues ?? getFlattenedStrings(fetchedValues ?? []),
      )}
      onClear={() => onChange(null)}
      onChange={onChange}
      onSearchChange={handleSearch}
      onDropdownOpen={() => setIsOpen(true)}
      onDropdownClose={() => setIsOpen(false)}
      enableSearch={enableSearch}
      placeholder={
        enableSearch ? t`Start typing to filter…` : t`Select a default value…`
      }
      isLoading={isLoading}
      noResultsText={isLoading ? t`Loading…` : t`No matching result`}
      errorMessage={
        isError
          ? t`Loading values failed. Please try again shortly.`
          : undefined
      }
    />
  );
}

function getCombinedValues(selected: string | null, other: string[]) {
  return [
    ...(selected ? [selected] : []),
    ...other.filter(v => v !== selected),
  ];
}

function getResetKey(parameter: Parameter): string {
  return JSON.stringify([
    parameter.values_source_config,
    parameter.values_source_type,
  ]);
}
