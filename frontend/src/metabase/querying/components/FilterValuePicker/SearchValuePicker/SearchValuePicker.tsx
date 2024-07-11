import { useMemo, useState } from "react";
import { useDebounce } from "react-use";
import { t } from "ttag";

import {
  useGetRemappedFieldValuesQuery,
  useSearchFieldValuesQuery,
} from "metabase/api";
import { Loader, MultiAutocomplete } from "metabase/ui";
import type { FieldId, FieldValue } from "metabase-types/api";

import { getEffectiveOptions } from "../utils";

import { SEARCH_DEBOUNCE, SEARCH_LIMIT } from "./constants";
import { shouldSearch } from "./utils";

interface SearchValuePickerProps {
  fieldId: FieldId;
  searchFieldId: FieldId;
  fieldValues: FieldValue[];
  selectedValues: string[];
  placeholder: string;
  nothingFoundMessage: string;
  shouldCreate?: (query: string, values: string[]) => boolean;
  autoFocus: boolean;
  onChange: (newValues: string[]) => void;
}

export function SearchValuePicker({
  fieldId,
  searchFieldId,
  fieldValues: initialFieldValues,
  selectedValues,
  placeholder,
  nothingFoundMessage,
  shouldCreate,
  autoFocus,
  onChange,
}: SearchValuePickerProps) {
  const [searchValue, setSearchValue] = useState("");
  const [searchQuery, setSearchQuery] = useState(searchValue);
  const canSearch = searchQuery.length > 0;
  const canRemap =
    fieldId !== searchFieldId &&
    selectedValues.length > 0 &&
    searchValue.length === 0;

  const {
    data: searchFieldValues = initialFieldValues,
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

  const { data: remappedFieldValues = [], isFetching: isRemapping } =
    useGetRemappedFieldValuesQuery(
      {
        fieldId,
        remappedFieldId: searchFieldId,
        values: selectedValues,
      },
      {
        skip: !canRemap,
      },
    );

  const options = useMemo(
    () =>
      getEffectiveOptions([
        ...(canRemap ? remappedFieldValues : []),
        ...(canSearch ? searchFieldValues : []),
      ]),
    [remappedFieldValues, searchFieldValues, canSearch, canRemap],
  );

  const isSearchStale = shouldSearch(
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

  const isFetching = isSearching || isRemapping;
  const isSearchComplete = !isSearching && !isSearchStale;
  useDebounce(handleSearchTimeout, SEARCH_DEBOUNCE, [searchValue]);

  return (
    <MultiAutocomplete
      data={options}
      value={selectedValues}
      searchValue={searchValue}
      placeholder={placeholder}
      searchable
      autoFocus={autoFocus}
      aria-label={t`Filter value`}
      shouldCreate={shouldCreate}
      rightSection={isFetching ? <Loader /> : null}
      nothingFound={isSearchComplete ? nothingFoundMessage : null}
      onChange={onChange}
      onSearchChange={handleSearchChange}
    />
  );
}
