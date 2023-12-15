import { useState } from "react";
import { useAsync, useDebounce } from "react-use";
import type { FieldId, FieldValue } from "metabase-types/api";
import { MultiSelect } from "metabase/ui";
import { getMergedOptions } from "../utils";
import { SEARCH_DEBOUNCE } from "./constants";
import { shouldSearch, getSearchValues } from "./utils";

interface SearchValuePickerProps {
  fieldId: FieldId;
  searchFieldId: FieldId;
  fieldValues: FieldValue[];
  selectedValues: string[];
  placeholder?: string;
  shouldCreate?: (query: string) => boolean;
  onChange: (newValues: string[]) => void;
}

export function SearchValuePicker({
  fieldId,
  searchFieldId,
  fieldValues: initialFieldValues,
  selectedValues,
  placeholder,
  shouldCreate = () => false,
  onChange,
}: SearchValuePickerProps) {
  const [searchValue, setSearchValue] = useState("");
  const [searchQuery, setSearchQuery] = useState(searchValue);

  const { value: fieldValues = initialFieldValues, loading } = useAsync(
    () => getSearchValues(fieldId, searchFieldId, searchQuery),
    [fieldId, searchFieldId, searchQuery],
  );

  const handleDebounce = () => {
    if (shouldSearch(fieldValues, searchValue, searchQuery)) {
      setSearchQuery(searchValue);
    }
  };

  useDebounce(handleDebounce, SEARCH_DEBOUNCE, [searchValue]);
  const options = getMergedOptions(fieldValues, selectedValues);
  const canCreate = !loading;

  return (
    <MultiSelect
      data={options}
      value={selectedValues}
      placeholder={placeholder}
      searchValue={searchValue}
      creatable
      searchable
      shouldCreate={query => canCreate && shouldCreate(query)}
      onChange={onChange}
      onCreate={query => {
        onChange([...selectedValues, query]);
        return query;
      }}
      onSearchChange={setSearchValue}
    />
  );
}
