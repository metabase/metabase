import { useState } from "react";
import { useAsyncFn, useDebounce } from "react-use";
import type { FieldId } from "metabase-types/api";
import { MultiSelect } from "metabase/ui";
import { getMergedOptions } from "../utils";
import { SEARCH_DEBOUNCE } from "./constants";
import { shouldSearch, getSearchValues } from "./utils";

interface SearchValuePickerProps {
  fieldId: FieldId;
  searchFieldId: FieldId;
  selectedValues: string[];
  placeholder?: string;
  shouldCreate?: (query: string) => boolean;
  onChange: (newValues: string[]) => void;
}

export function SearchValuePicker({
  fieldId,
  searchFieldId,
  selectedValues,
  placeholder,
  shouldCreate,
  onChange,
}: SearchValuePickerProps) {
  const [searchValue, setSearchValue] = useState("");
  const [lastSearchValue, setLastSearchValue] = useState(searchValue);

  const [{ value: fieldValues = [] }, handleSearch] = useAsyncFn(
    (value: string) => getSearchValues(fieldId, searchFieldId, value),
    [fieldId],
  );

  const handleDebounce = async () => {
    if (shouldSearch(fieldValues, searchValue, lastSearchValue)) {
      await handleSearch(searchValue);
      setLastSearchValue(searchValue);
    }
  };

  const options = getMergedOptions(fieldValues, selectedValues);
  useDebounce(handleDebounce, SEARCH_DEBOUNCE, [searchValue]);

  return (
    <MultiSelect
      data={options}
      value={selectedValues}
      placeholder={placeholder}
      searchValue={searchValue}
      creatable
      searchable
      shouldCreate={shouldCreate}
      onChange={onChange}
      onCreate={query => {
        onChange([...selectedValues, query]);
        return query;
      }}
      onSearchChange={setSearchValue}
    />
  );
}
