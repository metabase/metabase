import { useCallback, useEffect, useState } from "react";
import { useAsync } from "react-use";
import { t } from "ttag";
import { useDebouncedCallback } from "use-debounce";

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

  const [isOpen, setIsOpen] = useState(false);
  const [_, setSearchValue] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    onChange(null);
    setIsOpen(false);
    setSearchQuery("");
    setSearchValue("");
  }, [onChange, parameter.values_source_type, parameter.values_source_config]);

  const {
    value: fetchedValues,
    loading,
    error,
  } = useAsync(async () => {
    if (isOpen) {
      return await fetchValues(searchQuery);
    }
    return undefined;
  }, [
    isOpen,
    searchQuery,
    parameter.values_source_type,
    parameter.values_source_config,
    fetchValues,
  ]);

  const handleSearch = useDebouncedCallback(
    useCallback((query: string) => setSearchQuery(query), []),
    searchDebounceMs,
  );

  const handleChange = (value: string | null = null) => {
    onChange(value);
    setSearchValue(value ?? "");
  };

  const staticValues = getListParameterStaticValues(parameter);
  const enableSearch = shouldEnableSearch(parameter, forceSearchItemCount);

  return (
    <ListPicker
      value={value ?? ""} // Can't be null for the underlying Select
      options={getCombinedValues(
        value,
        staticValues ?? getFlattenedStrings(fetchedValues?.values ?? []),
      )}
      onClear={() => {}}
      // onClear={handleChange}
      onChange={handleChange}
      onSearchChange={handleSearch}
      onDropdownOpen={() => setIsOpen(true)}
      onDropdownClose={() => setIsOpen(false)}
      enableSearch={enableSearch}
      placeholder={
        enableSearch ? t`Start typing to filter…` : t`Select a default value…`
      }
      isLoading={loading}
      noResultsText={loading ? t`Loading…` : t`No matching result`}
      errorMessage={
        error ? t`Loading values failed. Please try again shortly.` : undefined
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
