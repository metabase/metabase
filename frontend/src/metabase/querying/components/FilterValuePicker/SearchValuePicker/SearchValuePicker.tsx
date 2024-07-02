import { useMemo, useState } from "react";
import { useDebounce } from "react-use";
import { t } from "ttag";

import {
  useGetRemappedFieldValuesQuery,
  useSearchFieldValuesQuery,
} from "metabase/api";
import { MultiAutocomplete } from "metabase/ui";
import type { FieldId, FieldValue } from "metabase-types/api";

import { getEffectiveOptions } from "../utils";

import { SEARCH_DEBOUNCE, SEARCH_LIMIT } from "./constants";
import { shouldSearch } from "./utils";

interface SearchValuePickerProps {
  fieldId: FieldId;
  searchFieldId: FieldId;
  fieldValues: FieldValue[];
  selectedValues: string[];
  placeholder?: string;
  shouldCreate?: (query: string, values: string[]) => boolean;
  autoFocus?: boolean;
  onChange: (newValues: string[]) => void;
}

export function SearchValuePicker({
  fieldId,
  searchFieldId,
  fieldValues: initialFieldValues,
  selectedValues,
  placeholder,
  shouldCreate,
  autoFocus,
  onChange,
}: SearchValuePickerProps) {
  const [searchValue, setSearchValue] = useState("");
  const [searchQuery, setSearchQuery] = useState(searchValue);

  const { data: remappedFieldValues = initialFieldValues } =
    useGetRemappedFieldValuesQuery(
      {
        fieldId,
        searchFieldId,
        value: selectedValues,
      },
      {
        skip: searchValue.length > 0 || selectedValues.length === 0,
      },
    );

  const { data: searchFieldValues = initialFieldValues } =
    useSearchFieldValuesQuery(
      {
        fieldId,
        searchFieldId,
        value: searchQuery,
        limit: SEARCH_LIMIT,
      },
      {
        skip: !searchQuery,
      },
    );

  const options = useMemo(
    () =>
      getEffectiveOptions(
        [...remappedFieldValues, ...searchFieldValues],
        selectedValues,
      ),
    [remappedFieldValues, searchFieldValues, selectedValues],
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
      data={options}
      value={selectedValues}
      searchValue={searchValue}
      placeholder={placeholder}
      searchable
      autoFocus={autoFocus}
      aria-label={t`Filter value`}
      shouldCreate={shouldCreate}
      onChange={onChange}
      onSearchChange={handleSearchChange}
    />
  );
}
