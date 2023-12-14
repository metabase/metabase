import { useState } from "react";
import { t } from "ttag";
import { Checkbox, SimpleGrid, Stack, Text, TextInput } from "metabase/ui";
import { Icon } from "metabase/core/components/Icon";
import type { FieldValue } from "metabase-types/api";
import { getMergedOptions } from "../utils";
import { searchOptions } from "./utils";

interface ListValuePickerProps {
  fieldValues: FieldValue[];
  selectedValues: string[];
  placeholder?: string;
  isCompact?: boolean;
  onChange: (newValues: string[]) => void;
}

export function ListValuePicker({
  fieldValues,
  selectedValues,
  isCompact,
  placeholder,
  onChange,
}: ListValuePickerProps) {
  return isCompact ? (
    <CompactValuePicker
      fieldValues={fieldValues}
      selectedValues={selectedValues}
      placeholder={placeholder}
      onChange={onChange}
    />
  ) : (
    <DefaultValuePicker
      fieldValues={fieldValues}
      selectedValues={selectedValues}
      placeholder={placeholder}
      onChange={onChange}
    />
  );
}

function DefaultValuePicker({
  fieldValues,
  selectedValues,
  placeholder,
  onChange,
}: ListValuePickerProps) {
  const [searchValue, setSearchValue] = useState("");
  const options = getMergedOptions(fieldValues, selectedValues);
  const visibleOptions = searchOptions(options, searchValue);

  return (
    <Stack>
      <TextInput
        value={searchValue}
        placeholder={placeholder}
        onChange={event => setSearchValue(event.currentTarget.value)}
      />
      <Checkbox.Group value={selectedValues} onChange={onChange}>
        {visibleOptions.length > 0 ? (
          <Stack>
            {visibleOptions.map(option => (
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
            <Text c="text.1" mt="lg" fw="bold">{t`Didn't find anything`}</Text>
          </Stack>
        )}
      </Checkbox.Group>
    </Stack>
  );
}

function CompactValuePicker({
  fieldValues,
  selectedValues,
  onChange,
}: ListValuePickerProps) {
  const options = getMergedOptions(fieldValues, selectedValues);

  return (
    <Checkbox.Group value={selectedValues} onChange={onChange}>
      <SimpleGrid cols={2}>
        {options.map(option => (
          <Checkbox
            key={option.value}
            value={option.value}
            label={option.label}
          />
        ))}
      </SimpleGrid>
    </Checkbox.Group>
  );
}
