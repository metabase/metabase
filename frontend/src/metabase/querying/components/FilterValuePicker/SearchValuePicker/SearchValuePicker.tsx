import { useLayoutEffect, useMemo, useState } from "react";
import { useDebounce } from "react-use";
import { t } from "ttag";

import {
  useGetRemappedFieldValuesQuery,
  useSearchFieldValuesQuery,
} from "metabase/api";
import { Loader, MultiAutocomplete, type SelectOption } from "metabase/ui";
import type { FieldId } from "metabase-types/api";

import { getFieldOptions } from "../utils";

import { SEARCH_DEBOUNCE, SEARCH_LIMIT } from "./constants";
import { getIsSearchStale, getNothingFoundMessage } from "./utils";

interface SearchValuePickerProps {
  fieldId: FieldId;
  searchFieldId: FieldId;
  selectedValues: string[];
  columnName: string;
  shouldCreate?: (query: string, values: string[]) => boolean;
  autoFocus?: boolean;
  onChange: (newValues: string[]) => void;
}

export function SearchValuePicker({
  fieldId,
  searchFieldId,
  selectedValues,
  columnName,
  shouldCreate,
  autoFocus,
  onChange,
}: SearchValuePickerProps) {
  const {
    searchValue,
    searchOptions,
    isSearching,
    isSearchStale,
    searchError,
    handleSearchChange,
  } = useSearchQuery({ fieldId, searchFieldId });

  const { selectedOptions, isRemapping } = useRemappingQuery({
    fieldId,
    searchFieldId,
    selectedValues,
    searchValue,
    searchOptions,
  });

  const availableOptions = useMemo(
    () => [...selectedOptions, ...searchOptions],
    [selectedOptions, searchOptions],
  );

  const nothingFoundMessage = getNothingFoundMessage(
    columnName,
    searchError,
    isSearching,
    isSearchStale,
  );

  return (
    <MultiAutocomplete
      data={availableOptions}
      value={selectedValues}
      placeholder={t`Search by ${columnName}`}
      searchable
      autoFocus={autoFocus}
      aria-label={t`Filter value`}
      shouldCreate={shouldCreate}
      rightSection={isSearching || isRemapping ? <Loader /> : null}
      nothingFound={nothingFoundMessage}
      onChange={onChange}
      onSearchChange={handleSearchChange}
    />
  );
}

interface SearchOptionsProps {
  fieldId: FieldId;
  searchFieldId: FieldId;
}

function useSearchQuery({ fieldId, searchFieldId }: SearchOptionsProps) {
  const [searchValue, setSearchValue] = useState("");
  const [searchQuery, setSearchQuery] = useState(searchValue);
  const canSearch = searchQuery.length > 0;

  const {
    data: searchFieldValues = [],
    isFetching: isSearching,
    error: searchError,
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

  const searchOptions = useMemo(
    () => getFieldOptions(searchFieldValues),
    [searchFieldValues],
  );

  const isSearchStale = getIsSearchStale(
    searchValue,
    searchQuery,
    searchFieldValues,
  );

  const handleSearchChange = (newSearchValue: string) => {
    setSearchValue(newSearchValue);
    if (newSearchValue === "") {
      setSearchQuery(newSearchValue);
    }
  };

  const handleSearchTimeout = () => {
    if (isSearchStale) {
      setSearchQuery(searchValue);
    }
  };

  useDebounce(handleSearchTimeout, SEARCH_DEBOUNCE, [searchValue]);

  return {
    searchValue,
    searchOptions,
    isSearching,
    isSearchStale,
    searchError,
    handleSearchChange,
  };
}

interface UseRemappingQueryProps {
  fieldId: FieldId;
  searchFieldId: FieldId;
  selectedValues: string[];
  searchValue: string;
  searchOptions: SelectOption[];
}

function useRemappingQuery({
  fieldId,
  searchFieldId,
  selectedValues,
  searchValue,
  searchOptions,
}: UseRemappingQueryProps) {
  const [cachedOptions, setCachedOptions] = useState<
    Record<string, SelectOption>
  >({});
  const selectedOptions = selectedValues
    .map(value => cachedOptions[value])
    .filter(option => option != null);
  const uncachedSelectedValues = selectedValues.filter(
    option => !cachedOptions[option],
  );
  const isRemapped = fieldId !== searchFieldId;
  const isFullyCached = uncachedSelectedValues.length === 0;
  const isTypingUnfinished = searchValue.length > 0;

  const { data: remappedFieldValues = [], isFetching: isRemapping } =
    useGetRemappedFieldValuesQuery(
      {
        fieldId,
        remappedFieldId: searchFieldId,
        values: uncachedSelectedValues,
      },
      {
        skip: !isRemapped || isFullyCached || isTypingUnfinished,
      },
    );

  const remappedOptions = useMemo(
    () => getFieldOptions(remappedFieldValues),
    [remappedFieldValues],
  );

  useLayoutEffect(() => {
    const fetchedOptions = [...searchOptions, ...remappedOptions];
    if (!fetchedOptions.every(option => cachedOptions[option.value])) {
      const newOptions = { ...cachedOptions };
      fetchedOptions.forEach(option => (newOptions[option.value] = option));
      setCachedOptions(newOptions);
    }
  }, [searchOptions, remappedOptions, cachedOptions]);

  return {
    selectedOptions,
    isRemapping,
  };
}
