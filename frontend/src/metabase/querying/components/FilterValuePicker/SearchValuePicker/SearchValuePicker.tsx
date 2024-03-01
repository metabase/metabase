import { useMemo, useState } from "react";
import { useAsync, useDebounce } from "react-use";
import { t } from "ttag";

import { MultiSelect, Select } from "metabase/ui";
import type { FieldId, FieldValue } from "metabase-types/api";

import {
  getOptionsWithSearchValue,
  getFieldAndSelectedOptions,
} from "../utils";

import { SEARCH_DEBOUNCE } from "./constants";
import { shouldSearch, getSearchValues } from "./utils";

interface SearchValuePickerProps {
  fieldId: FieldId;
  searchFieldId: FieldId;
  fieldValues: FieldValue[];
  selectedValues: string[];
  placeholder?: string;
  isAutoFocus?: boolean;
  isMultiple?: boolean;
  isValueValid: (query: string) => boolean;
  onChange: (newValues: string[]) => void;
}

export function SearchValuePicker({
  fieldId,
  searchFieldId,
  fieldValues: initialFieldValues,
  selectedValues,
  placeholder,
  isAutoFocus,
  isMultiple,
  isValueValid,
  onChange,
}: SearchValuePickerProps) {
  const [searchValue, setSearchValue] = useState("");
  const [searchQuery, setSearchQuery] = useState(searchValue);

  const { value: fieldValues = initialFieldValues } = useAsync(
    () => getSearchValues(fieldId, searchFieldId, searchQuery),
    [fieldId, searchFieldId, searchQuery],
  );

  const options = useMemo(
    () => getFieldAndSelectedOptions(fieldValues, selectedValues),
    [fieldValues, selectedValues],
  );

  const handleChange = (value: string | null) => {
    onChange(value != null ? [value] : []);
  };

  const handleSearchChange = (newSearchValue: string) => {
    setSearchValue(newSearchValue);
    if (newSearchValue === "") {
      setSearchQuery(newSearchValue);
    }
  };

  const handleSearchTimeout = () => {
    if (shouldSearch(searchValue, searchQuery, fieldValues)) {
      setSearchQuery(searchValue);
    }
  };

  useDebounce(handleSearchTimeout, SEARCH_DEBOUNCE, [searchValue]);

  return isMultiple ? (
    <MultiSelect
      data={getOptionsWithSearchValue(options, searchValue, isValueValid)}
      value={selectedValues}
      searchValue={searchValue}
      placeholder={placeholder}
      searchable
      autoFocus={isAutoFocus}
      aria-label={t`Filter value`}
      onChange={onChange}
      onSearchChange={handleSearchChange}
    />
  ) : (
    <Select
      data={getOptionsWithSearchValue(options, searchValue, isValueValid)}
      value={selectedValues[0]}
      searchValue={searchValue}
      placeholder={placeholder}
      searchable
      autoFocus={isAutoFocus}
      aria-label={t`Filter value`}
      onChange={handleChange}
      onSearchChange={handleSearchChange}
    />
  );
}
