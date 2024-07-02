import { forwardRef, type Ref, useMemo, useState } from "react";
import { useDebounce } from "react-use";
import { t } from "ttag";

import {
  skipToken,
  useGetRemappedFieldValueQuery,
  useSearchFieldValuesQuery,
} from "metabase/api";
import { MultiAutocomplete, type SelectItemProps } from "metabase/ui";
import type { FieldId, FieldValue } from "metabase-types/api";

import { getFieldOptions } from "../utils";

import { SEARCH_DEBOUNCE, SEARCH_LIMIT } from "./constants";
import { shouldSearch } from "./utils";

interface SearchValuePickerProps {
  fieldId: FieldId;
  searchFieldId: FieldId;
  remappedFieldId: FieldId | null;
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
  remappedFieldId,
  fieldValues: initialFieldValues,
  selectedValues,
  placeholder,
  shouldCreate,
  autoFocus,
  onChange,
}: SearchValuePickerProps) {
  const [searchValue, setSearchValue] = useState("");
  const [searchQuery, setSearchQuery] = useState(searchValue);

  const { data: fieldValues = initialFieldValues } = useSearchFieldValuesQuery(
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

  const options = useMemo(() => {
    return getFieldOptions(fieldValues);
  }, [fieldValues]);

  const itemComponent = useMemo(() => {
    return getItemComponent(fieldId, remappedFieldId);
  }, [fieldId, remappedFieldId]);

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
      itemComponent={itemComponent}
      onChange={onChange}
      onSearchChange={handleSearchChange}
    />
  );
}

function getItemComponent(fieldId: FieldId, remappedFieldId: FieldId | null) {
  return forwardRef(function SearchValuePickerItem(
    { value, label, ...props }: SelectItemProps,
    ref: Ref<HTMLDivElement>,
  ) {
    const { data } = useGetRemappedFieldValueQuery(
      value != null && remappedFieldId != null
        ? { fieldId, remappedFieldId, value }
        : skipToken,
    );

    const [_, text = value] = data ?? [value, label];

    return (
      <div ref={ref} {...props}>
        {text}
      </div>
    );
  });
}
