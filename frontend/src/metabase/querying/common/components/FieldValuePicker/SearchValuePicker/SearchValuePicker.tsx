import { useState } from "react";
import { useDebounce } from "react-use";
import { t } from "ttag";

import {
  getFieldOption,
  getFieldOptions,
} from "metabase/querying/common/utils";
import {
  type ComboboxItem,
  type ComboboxProps,
  Loader,
  MultiAutocomplete,
  MultiAutocompleteOption,
  MultiAutocompleteValue,
} from "metabase/ui";
import type { FieldValue } from "metabase-types/api";

import type {
  UseGetRemappedFieldValueArgs,
  UseGetRemappedFieldValueResult,
  UseSearchFieldValuesArgs,
  UseSearchFieldValuesResult,
} from "../types";

import { SEARCH_DEBOUNCE, SEARCH_LIMIT } from "./constants";
import { getEmptyResultsMessage, shouldSearch } from "./utils";

type SearchValuePickerProps = {
  canRemapValues: boolean;
  fieldValues: FieldValue[];
  selectedValues: string[];
  placeholder?: string;
  nothingFoundMessage?: string;
  autoFocus?: boolean;
  comboboxProps?: ComboboxProps;
  parseValue?: (rawValue: string) => string | null;
  useSearchFieldValues: (
    args: UseSearchFieldValuesArgs,
  ) => UseSearchFieldValuesResult;
  useGetRemappedFieldValue: (
    args: UseGetRemappedFieldValueArgs,
  ) => UseGetRemappedFieldValueResult;
  onChange: (newValues: string[]) => void;
};

export function SearchValuePicker({
  canRemapValues,
  fieldValues: initialFieldValues,
  selectedValues,
  placeholder,
  nothingFoundMessage,
  autoFocus,
  comboboxProps,
  parseValue,
  useSearchFieldValues,
  useGetRemappedFieldValue,
  onChange,
}: SearchValuePickerProps) {
  const [searchValue, setSearchValue] = useState("");
  const [searchQuery, setSearchQuery] = useState(searchValue);
  const canSearch = searchQuery.length > 0;

  const {
    data: searchFieldValues,
    error: searchError,
    isFetching: isSearching,
  } = useSearchFieldValues({
    value: searchQuery,
    limit: SEARCH_LIMIT,
    skip: !canSearch,
  });

  const searchOptions = canSearch
    ? getFieldOptions(searchFieldValues ?? [])
    : getFieldOptions(initialFieldValues);
  const emptyResultsMessage = getEmptyResultsMessage(
    nothingFoundMessage,
    searchError,
    canSearch,
    isSearching,
  );

  const handleSearchChange = (newSearchValue: string) => {
    setSearchValue(newSearchValue);
    if (newSearchValue === "") {
      setSearchQuery(newSearchValue);
    }
  };

  const handleSearchTimeout = () => {
    if (shouldSearch(searchValue, searchQuery, searchFieldValues ?? [])) {
      setSearchQuery(searchValue);
    }
  };

  useDebounce(handleSearchTimeout, SEARCH_DEBOUNCE, [searchValue]);

  return (
    <MultiAutocomplete
      value={selectedValues}
      data={searchOptions}
      placeholder={placeholder}
      autoFocus={autoFocus}
      rightSection={isSearching ? <Loader size="xs" /> : undefined}
      nothingFoundMessage={emptyResultsMessage}
      comboboxProps={comboboxProps}
      aria-label={t`Filter value`}
      parseValue={parseValue}
      renderValue={({ value }) => (
        <RemappedValue
          value={value}
          canRemapValues={canRemapValues}
          useGetRemappedFieldValue={useGetRemappedFieldValue}
        />
      )}
      renderOption={({ option }) => (
        <RemappedOption option={option} canRemapValues={canRemapValues} />
      )}
      onChange={onChange}
      onSearchChange={handleSearchChange}
    />
  );
}

type RemappedValueProps = {
  value: string;
  canRemapValues: boolean;
  useGetRemappedFieldValue: (
    args: UseGetRemappedFieldValueArgs,
  ) => UseGetRemappedFieldValueResult;
};

function RemappedValue({
  value,
  canRemapValues,
  useGetRemappedFieldValue,
}: RemappedValueProps) {
  const { data: remappedValue } = useGetRemappedFieldValue({
    value,
    skip: !canRemapValues,
  });

  if (remappedValue == null) {
    return value;
  }

  const option = getFieldOption(remappedValue);
  return <MultiAutocompleteValue value={option.value} label={option.label} />;
}

type RemappedOptionProps = {
  option: ComboboxItem;
  canRemapValues: boolean;
};

function RemappedOption({ option, canRemapValues }: RemappedOptionProps) {
  if (!canRemapValues) {
    return option.label;
  }

  return <MultiAutocompleteOption value={option.value} label={option.label} />;
}
