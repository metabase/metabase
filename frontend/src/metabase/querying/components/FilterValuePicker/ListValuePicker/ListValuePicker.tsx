import { useState } from "react";
import { t } from "ttag";
import { Checkbox, SimpleGrid, Stack, Text, TextInput } from "metabase/ui";
import { Icon } from "metabase/core/components/Icon";
import type { FieldValue } from "metabase-types/api";
import { getMergedOptions } from "../utils";
import { searchOptions } from "./utils";

interface ListValuePickerProps {
  data: FieldValue[];
  value: string[];
  placeholder?: string;
  isCompact?: boolean;
  onChange: (newValue: string[]) => void;
}

export function ListValuePicker({
  data,
  value,
  isCompact,
  placeholder,
  onChange,
}: ListValuePickerProps) {
  return isCompact ? (
    <CompactValuePicker
      data={data}
      value={value}
      placeholder={placeholder}
      onChange={onChange}
    />
  ) : (
    <DefaultValuePicker
      data={data}
      value={value}
      placeholder={placeholder}
      onChange={onChange}
    />
  );
}

function DefaultValuePicker({
  data,
  value,
  placeholder,
  onChange,
}: ListValuePickerProps) {
  const [searchValue, setSearchValue] = useState("");
  const options = getMergedOptions(data, value);
  const visibleOptions = searchOptions(options, searchValue);

  return (
    <Stack>
      <TextInput
        value={searchValue}
        placeholder={placeholder}
        onChange={event => setSearchValue(event.currentTarget.value)}
      />
      <Checkbox.Group value={value} onChange={onChange}>
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

function CompactValuePicker({ data, value, onChange }: ListValuePickerProps) {
  const options = getMergedOptions(data, value);

  return (
    <Checkbox.Group value={value} onChange={onChange}>
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
