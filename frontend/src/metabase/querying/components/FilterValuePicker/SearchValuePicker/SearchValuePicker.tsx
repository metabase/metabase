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
import { getIsSearchStale, getNothingFoundMessage } from "./utils";

interface SearchValuePickerProps {
  fieldId: FieldId;
  searchFieldId: FieldId;
  fieldValues: FieldValue[];
  selectedValues: string[];
  columnName: string;
  shouldCreate?: (query: string, values: string[]) => boolean;
  autoFocus?: boolean;
  onChange: (newValues: string[]) => void;
}

export function SearchValuePicker({
  fieldId,
  searchFieldId,
  fieldValues: initialFieldValues,
  selectedValues,
  columnName,
  shouldCreate,
  autoFocus,
  onChange,
}: SearchValuePickerProps) {
  const [searchValue, setSearchValue] = useState("");
  const [searchQuery, setSearchQuery] = useState(searchValue);
  const canSearch = searchQuery.length > 0;
  const canRemap = fieldId !== searchFieldId && selectedValues.length > 0;

  const {
    data: searchFieldValues = initialFieldValues,
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

  const { data: remappedFieldValues = [], isFetching: isRemapping } =
    useGetRemappedFieldValuesQuery(
      {
        fieldId,
        remappedFieldId: searchFieldId,
        values: selectedValues,
      },
      {
        skip: !canRemap || searchValue.length > 0,
      },
    );

  const options = useMemo(
    () =>
      getEffectiveOptions([
        ...(canRemap ? remappedFieldValues : []),
        ...(canSearch ? searchFieldValues : []),
      ]),
    [searchFieldValues, remappedFieldValues, canSearch, canRemap],
  );
  const isFetching = isSearching || isRemapping;
  const isSearchStale = getIsSearchStale(
    searchValue,
    searchQuery,
    searchFieldValues,
  );
  const nothingFoundMessage = getNothingFoundMessage(
    columnName,
    searchError,
    isSearching,
    isSearchStale,
  );

  const handleSearchChange = (newSearchValue: string) => {
    setSearchValue(newSearchValue);
    if (newSearchValue === "") {
      setSearchQuery(newSearchValue);
    }
  };

  const handleSearchTimeout = () => {
    if (getIsSearchStale(searchValue, searchQuery, searchFieldValues)) {
      setSearchQuery(searchValue);
    }
  };

  useDebounce(handleSearchTimeout, SEARCH_DEBOUNCE, [searchValue]);

  return (
    <MultiAutocomplete
      data={options}
      value={selectedValues}
      placeholder={t`Search by ${columnName}`}
      searchable
      autoFocus={autoFocus}
      aria-label={t`Filter value`}
      shouldCreate={shouldCreate}
      rightSection={isFetching ? <Loader /> : null}
      nothingFound={nothingFoundMessage}
      onChange={onChange}
      onSearchChange={handleSearchChange}
    />
  );
}
