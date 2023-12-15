import { useState } from "react";
import { useAsyncFn, useDebounce } from "react-use";
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
  const [lastSearchValue, setLastSearchValue] = useState(searchValue);

  const [{ value: fieldValues = initialFieldValues, loading }, handleSearch] =
    useAsyncFn(
      (value: string) =>
        getSearchValues(fieldId, searchFieldId, value, initialFieldValues),
      [fieldId],
    );

  const handleDebounce = async () => {
    if (shouldSearch(fieldValues, searchValue, lastSearchValue)) {
      await handleSearch(searchValue);
      setLastSearchValue(searchValue);
    }
  };

  const options = getMergedOptions(fieldValues, selectedValues);
  const [isReady] = useDebounce(handleDebounce, SEARCH_DEBOUNCE, [searchValue]);

  return (
    <MultiSelect
      data={options}
      value={selectedValues}
      placeholder={placeholder}
      searchValue={searchValue}
      creatable
      searchable
      shouldCreate={query =>
        !loading && isReady() === true && shouldCreate(query)
      }
      onChange={onChange}
      onCreate={query => {
        onChange([...selectedValues, query]);
        return query;
      }}
      onSearchChange={setSearchValue}
    />
  );
}
