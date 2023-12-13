import { useState } from "react";
import { useAsyncFn, useDebounce } from "react-use";
import type { FieldId } from "metabase-types/api";
import { MultiSelect } from "metabase/ui";
import { getEffectiveOptions } from "../utils";
import { DEBOUNCE_DURATION } from "./constants";
import { searchValues } from "./utils";

interface SearchValuePickerProps {
  fieldId: FieldId;
  value: string[];
  placeholder?: string;
  getCreateLabel?: (value: string) => string | null;
  onChange: (newValue: string[]) => void;
}

export function SearchValuePicker({
  fieldId,
  value,
  placeholder,
  getCreateLabel,
  onChange,
}: SearchValuePickerProps) {
  const [searchValue, setSearchValue] = useState("");

  const [{ value: data = [] }, handleSearch] = useAsyncFn(
    (value: string) => searchValues(fieldId, value),
    [fieldId],
  );

  useDebounce(() => handleSearch(searchValue), DEBOUNCE_DURATION, [
    searchValue,
  ]);

  const options = getEffectiveOptions(data, value);

  return (
    <MultiSelect
      data={options}
      value={value}
      placeholder={placeholder}
      searchValue={searchValue}
      creatable
      searchable
      onChange={onChange}
      getCreateLabel={getCreateLabel}
      onCreate={query => {
        onChange([...value, query]);
        return query;
      }}
      onSearchChange={setSearchValue}
    />
  );
}
