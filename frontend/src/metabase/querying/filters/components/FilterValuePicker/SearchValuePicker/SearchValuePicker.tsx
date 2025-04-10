import { useState } from "react";
import { useDebounce } from "react-use";
import { t } from "ttag";

import { useSearchFieldValuesQuery } from "metabase/api";
import { type ComboboxProps, Loader, MultiAutocomplete } from "metabase/ui";
import type { FieldId, FieldValue } from "metabase-types/api";

import { getFieldOptions } from "../utils";

import { SEARCH_DEBOUNCE, SEARCH_LIMIT } from "./constants";
import {
  getFilteredOptions,
  getNothingFoundMessage,
  shouldSearch,
} from "./utils";

interface SearchValuePickerProps {
  fieldId: FieldId;
  searchFieldId: FieldId;
  fieldValues: FieldValue[];
  selectedValues: string[];
  columnDisplayName: string;
  autoFocus?: boolean;
  comboboxProps?: ComboboxProps;
  onCreate?: (rawValue: string) => string | null;
  onChange: (newValues: string[]) => void;
}

export function SearchValuePicker({
  fieldId,
  searchFieldId,
  fieldValues: initialFieldValues,
  selectedValues,
  columnDisplayName,
  autoFocus,
  comboboxProps,
  onCreate,
  onChange,
}: SearchValuePickerProps) {
  const [searchValue, setSearchValue] = useState("");
  const [searchQuery, setSearchQuery] = useState(searchValue);
  const canSearch = searchQuery.length > 0;

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
  const visibleOptions = getFilteredOptions(
    searchOptions,
    searchValue,
    selectedValues,
  );
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
      data={visibleOptions}
      placeholder={t`Search by ${columnDisplayName}`}
      autoFocus={autoFocus}
      rightSection={isSearching ? <Loader size="xs" /> : undefined}
      nothingFoundMessage={nothingFoundMessage}
      comboboxProps={comboboxProps}
      aria-label={t`Filter value`}
      onCreate={onCreate}
      onChange={onChange}
      onSearchChange={handleSearchChange}
    />
  );
}
