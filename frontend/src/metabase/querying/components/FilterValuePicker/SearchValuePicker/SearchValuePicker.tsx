import { useMemo, useState } from "react";
import { useAsync, useDebounce } from "react-use";
import { t } from "ttag";
import type { FieldId, FieldValue } from "metabase-types/api";
import { MultiSelect } from "metabase/ui";
import { getEffectiveOptions } from "../utils";
import { SEARCH_DEBOUNCE } from "./constants";
import { shouldSearch, getSearchValues } from "./utils";

interface SearchValuePickerProps {
  fieldId: FieldId;
  searchFieldId: FieldId;
  fieldValues: FieldValue[];
  selectedValues: string[];
  placeholder?: string;
  canAddValue: (query: string) => boolean;
  autoFocus?: boolean;
  onChange: (newValues: string[]) => void;
}

export function SearchValuePicker({
  fieldId,
  searchFieldId,
  fieldValues: initialFieldValues,
  selectedValues,
  placeholder,
  canAddValue,
  autoFocus,
  onChange,
}: SearchValuePickerProps) {
  const [searchValue, setSearchValue] = useState("");
  const [searchQuery, setSearchQuery] = useState(searchValue);

  const { value: fieldValues = initialFieldValues } = useAsync(
    () => getSearchValues(fieldId, searchFieldId, searchQuery),
    [fieldId, searchFieldId, searchQuery],
  );

  const options = useMemo(
    () => getEffectiveOptions(fieldValues, selectedValues),
    [fieldValues, selectedValues],
  );

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

  const handleCreate = (searchValue: string) => {
    onChange([...selectedValues, searchValue]);
    return searchValue;
  };

  const shouldCreate = (searchValue: string) => {
    return (
      canAddValue(searchValue) &&
      !options.some(option => option.label === searchValue)
    );
  };

  useDebounce(handleSearchTimeout, SEARCH_DEBOUNCE, [searchValue]);

  return (
    <MultiSelect
      data={options}
      value={selectedValues}
      searchValue={searchValue}
      placeholder={placeholder}
      shouldCreate={shouldCreate}
      getCreateLabel={searchValue => searchValue}
      creatable
      searchable
      autoFocus={autoFocus}
      aria-label={t`Filter value`}
      onChange={onChange}
      onSearchChange={handleSearchChange}
      onCreate={handleCreate}
    />
  );
}
