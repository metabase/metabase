import { useState } from "react";
import { useDebounce } from "react-use";
import { t } from "ttag";

import {
  useGetRemappedFieldValueQuery,
  useSearchFieldValuesQuery,
} from "metabase/api";
import {
  Box,
  type ComboboxItem,
  type ComboboxProps,
  Flex,
  Loader,
  MultiAutocomplete,
} from "metabase/ui";
import type { FieldId, FieldValue } from "metabase-types/api";

import { getFieldOption, getFieldOptions } from "../utils";

import { SEARCH_DEBOUNCE, SEARCH_LIMIT } from "./constants";
import { getNothingFoundMessage, shouldSearch } from "./utils";

type SearchValuePickerProps = {
  fieldId: FieldId;
  searchFieldId: FieldId;
  fieldValues: FieldValue[];
  selectedValues: string[];
  columnDisplayName: string;
  autoFocus?: boolean;
  comboboxProps?: ComboboxProps;
  parseValue?: (rawValue: string) => string | null;
  onChange: (newValues: string[]) => void;
};

export function SearchValuePicker({
  fieldId,
  searchFieldId,
  fieldValues: initialFieldValues,
  selectedValues,
  columnDisplayName,
  autoFocus,
  comboboxProps,
  parseValue,
  onChange,
}: SearchValuePickerProps) {
  const [searchValue, setSearchValue] = useState("");
  const [searchQuery, setSearchQuery] = useState(searchValue);
  const canSearch = searchQuery.length > 0;
  const isRemapped = fieldId !== searchFieldId;

  const {
    data: searchFieldValues = [],
    error: searchError,
    isFetching: isSearching,
  } = useSearchFieldValuesQuery(
    {
      fieldId,
      searchFieldId,
      value: searchQuery,
      limit: SEARCH_LIMIT,
    },
    {
      skip: !canSearch,
    },
  );

  const searchOptions = canSearch
    ? getFieldOptions(searchFieldValues)
    : getFieldOptions(initialFieldValues);
  const nothingFoundMessage = getNothingFoundMessage(
    columnDisplayName,
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
    if (shouldSearch(searchValue, searchQuery, searchFieldValues)) {
      setSearchQuery(searchValue);
    }
  };

  useDebounce(handleSearchTimeout, SEARCH_DEBOUNCE, [searchValue]);

  return (
    <MultiAutocomplete
      value={selectedValues}
      data={searchOptions}
      placeholder={t`Search by ${columnDisplayName}`}
      autoFocus={autoFocus}
      rightSection={isSearching ? <Loader size="xs" /> : undefined}
      nothingFoundMessage={nothingFoundMessage}
      comboboxProps={comboboxProps}
      aria-label={t`Filter value`}
      parseValue={parseValue}
      renderValue={(value) => (
        <RemappedValue
          fieldId={fieldId}
          searchFieldId={searchFieldId}
          value={value}
          isRemapped={isRemapped}
        />
      )}
      renderOption={({ option }) => (
        <RemappedOption option={option} isRemapped={isRemapped} />
      )}
      onChange={onChange}
      onSearchChange={handleSearchChange}
    />
  );
}

type RemappedValueProps = {
  fieldId: FieldId;
  searchFieldId: FieldId;
  value: string;
  isRemapped: boolean;
};

function RemappedValue({
  fieldId,
  searchFieldId,
  value,
  isRemapped,
}: RemappedValueProps) {
  const { data: remappedValue } = useGetRemappedFieldValueQuery(
    {
      fieldId,
      remappedFieldId: searchFieldId,
      value,
    },
    {
      skip: !isRemapped,
    },
  );

  if (remappedValue == null) {
    return value;
  }

  const option = getFieldOption(remappedValue);
  return (
    <Flex component="span" gap="sm">
      <span>{option.label}</span>
      <Box opacity={0.5}>{option.value}</Box>
    </Flex>
  );
}

type RemappedOptionProps = {
  option: ComboboxItem;
  isRemapped: boolean;
};

function RemappedOption({ option, isRemapped }: RemappedOptionProps) {
  if (!isRemapped) {
    return option.value;
  }

  return (
    <Flex flex={1} justify="space-between" gap="sm">
      <span>{option.label}</span>
      <Box opacity={0.5}>{option.value}</Box>
    </Flex>
  );
}
