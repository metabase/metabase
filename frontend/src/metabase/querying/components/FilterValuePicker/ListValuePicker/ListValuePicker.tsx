import type { ChangeEvent } from "react";
import { useState } from "react";
import { t } from "ttag";
import { Checkbox, MultiSelect, Stack, Text, TextInput } from "metabase/ui";
import { Icon } from "metabase/core/components/Icon";
import type { FieldValue } from "metabase-types/api";
import { getMergedItems } from "../utils";
import { LONG_ITEM_LENGTH, MAX_INLINE_ITEMS } from "./constants";
import { searchItems } from "./utils";
import { ColumnGrid } from "./ListValuePicker.styled";

interface ListValuePickerProps {
  fieldValues: FieldValue[];
  selectedValues: string[];
  placeholder?: string;
  autoFocus?: boolean;
  compact?: boolean;
  onChange: (newValues: string[]) => void;
}

export function ListValuePicker({
  fieldValues,
  selectedValues,
  placeholder,
  autoFocus,
  compact,
  onChange,
}: ListValuePickerProps) {
  if (!compact) {
    return (
      <DefaultValuePicker
        fieldValues={fieldValues}
        selectedValues={selectedValues}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={onChange}
      />
    );
  } else if (fieldValues.length <= MAX_INLINE_ITEMS) {
    return (
      <CheckboxValuePicker
        fieldValues={fieldValues}
        selectedValues={selectedValues}
        placeholder={placeholder}
        onChange={onChange}
      />
    );
  } else {
    return (
      <SelectValuePicker
        fieldValues={fieldValues}
        selectedValues={selectedValues}
        placeholder={placeholder}
        onChange={onChange}
      />
    );
  }
}

function DefaultValuePicker({
  fieldValues,
  selectedValues,
  placeholder,
  autoFocus,
  onChange,
}: ListValuePickerProps) {
  const [searchValue, setSearchValue] = useState("");
  const items = getMergedItems(fieldValues, selectedValues);
  const visibleItems = searchItems(items, searchValue);

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSearchValue(event.currentTarget.value);
  };

  return (
    <Stack>
      <TextInput
        value={searchValue}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={handleInputChange}
      />
      <Checkbox.Group value={selectedValues} onChange={onChange}>
        {visibleItems.length > 0 ? (
          <Stack>
            {visibleItems.map(option => (
              <Checkbox
                key={option.value}
                value={option.value}
                label={option.label}
              />
            ))}
          </Stack>
        ) : (
          <Stack c="text.0" justify="center" align="center">
            <Icon name="search" size={40} />
            <Text c="text.1" fw="bold">{t`Didn't find anything`}</Text>
          </Stack>
        )}
      </Checkbox.Group>
    </Stack>
  );
}

function CheckboxValuePicker({
  fieldValues,
  selectedValues,
  onChange,
}: ListValuePickerProps) {
  const items = getMergedItems(fieldValues, selectedValues);
  const hasLongItems = items.some(
    ({ label }) => label != null && label.length > LONG_ITEM_LENGTH,
  );
  const cols = hasLongItems ? 1 : 2;
  const rows = Math.ceil(items.length / cols);

  return (
    <Checkbox.Group value={selectedValues} onChange={onChange}>
      <ColumnGrid rows={rows}>
        {items.map(item => (
          <Checkbox key={item.value} value={item.value} label={item.label} />
        ))}
      </ColumnGrid>
    </Checkbox.Group>
  );
}

export function SelectValuePicker({
  fieldValues,
  selectedValues,
  placeholder,
  autoFocus,
  onChange,
}: ListValuePickerProps) {
  const items = getMergedItems(fieldValues, selectedValues);

  return (
    <MultiSelect
      data={items}
      value={selectedValues}
      placeholder={placeholder}
      autoFocus={autoFocus}
      aria-label={t`Filter value`}
      onChange={onChange}
    />
  );
}
