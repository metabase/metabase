import { useState } from "react";
import { useAsyncFn, useDebounce } from "react-use";
import type { FieldId } from "metabase-types/api";
import { MultiSelect } from "metabase/ui";
import { getEffectiveOptions } from "../utils";
import { SEARCH_DEBOUNCE } from "./constants";
import { shouldSearch, getSearchValues } from "./utils";

interface SearchValuePickerProps {
  fieldId: FieldId;
  value: string[];
  placeholder?: string;
  shouldCreate?: (query: string) => boolean;
  onChange: (newValue: string[]) => void;
}

export function SearchValuePicker({
  fieldId,
  value,
  placeholder,
  shouldCreate,
  onChange,
}: SearchValuePickerProps) {
  const [searchValue, setSearchValue] = useState("");
  const [lastSearchValue, setLastSearchValue] = useState(searchValue);

  const [{ value: data = [] }, handleSearch] = useAsyncFn(
    (value: string) => getSearchValues(fieldId, value),
    [fieldId],
  );

  const handleDebounce = async () => {
    if (shouldSearch(data, searchValue, lastSearchValue)) {
      await handleSearch(searchValue);
      setLastSearchValue(searchValue);
    }
  };

  const options = getEffectiveOptions(data, value);
  useDebounce(handleDebounce, SEARCH_DEBOUNCE, [searchValue]);

  return (
    <MultiSelect
      data={options}
      value={value}
      placeholder={placeholder}
      searchValue={searchValue}
      creatable
      searchable
      shouldCreate={shouldCreate}
      onChange={onChange}
      onCreate={query => {
        onChange([...value, query]);
        return query;
      }}
      onSearchChange={setSearchValue}
    />
  );
}
