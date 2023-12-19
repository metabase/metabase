import type { FocusEvent } from "react";
import { useMemo, useState } from "react";
import { useAsync, useDebounce } from "react-use";
import { t } from "ttag";
import type { FieldId, FieldValue } from "metabase-types/api";
import { MultiAutocomplete } from "metabase/ui";
import { getFieldOptions } from "../utils";
import { SEARCH_DEBOUNCE } from "./constants";
import { shouldSearch, getSearchValues } from "./utils";

interface SearchValuePickerProps {
  fieldId: FieldId;
  searchFieldId: FieldId;
  fieldValues: FieldValue[];
  selectedValues: string[];
  placeholder?: string;
  shouldCreate: (query: string) => boolean;
  autoFocus?: boolean;
  onChange: (newValues: string[]) => void;
  onFocus?: (event: FocusEvent<HTMLInputElement>) => void;
  onBlur?: (event: FocusEvent<HTMLInputElement>) => void;
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
  onFocus,
  onBlur,
}: SearchValuePickerProps) {
  const [searchValue, setSearchValue] = useState("");
  const [searchQuery, setSearchQuery] = useState(searchValue);

  const { value: fieldValues = initialFieldValues } = useAsync(
    () => getSearchValues(fieldId, searchFieldId, searchQuery),
    [fieldId, searchFieldId, searchQuery],
  );

  const handleDebounce = () => {
    if (shouldSearch(searchValue, searchQuery, fieldValues)) {
      setSearchQuery(searchValue);
    }
  };

  const options = useMemo(() => getFieldOptions(fieldValues), [fieldValues]);
  useDebounce(handleDebounce, SEARCH_DEBOUNCE, [searchValue]);

  return (
    <MultiAutocomplete
      data={options}
      value={selectedValues}
      placeholder={placeholder}
      searchValue={searchValue}
      shouldCreate={shouldCreate}
      autoFocus={autoFocus}
      aria-label={t`Filter value`}
      onChange={onChange}
      onSearchChange={setSearchValue}
      onFocus={onFocus}
      onBlur={onBlur}
    />
  );
}
