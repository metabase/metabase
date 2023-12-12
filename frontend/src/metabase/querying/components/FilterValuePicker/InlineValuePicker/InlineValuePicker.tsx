import { useMemo } from "react";
import { t } from "ttag";
import { Checkbox, SimpleGrid, Stack, TextInput } from "metabase/ui";
import type { FieldValue } from "metabase-types/api";
import { getFieldOptions } from "../utils";

interface InlineValuePickerProps {
  data: FieldValue[];
  value: string[];
  compact?: boolean;
  onChange: (newValue: string[]) => void;
}

export function InlineValuePicker({
  data,
  value,
  compact,
  onChange,
}: InlineValuePickerProps) {
  return compact ? (
    <CompactValuePicker data={data} value={value} onChange={onChange} />
  ) : (
    <DefaultValuePicker data={data} value={value} onChange={onChange} />
  );
}

function DefaultValuePicker({ data, value, onChange }: InlineValuePickerProps) {
  const options = useMemo(() => getFieldOptions(data), [data]);

  return (
    <Stack>
      <TextInput placeholder={t`Search the list`} />
      <Checkbox.Group value={value} onChange={onChange}>
        <Stack>
          {options.map(option => (
            <Checkbox
              key={option.value}
              value={option.value}
              label={option.label}
            />
          ))}
        </Stack>
      </Checkbox.Group>
    </Stack>
  );
}

function CompactValuePicker({ data, value, onChange }: InlineValuePickerProps) {
  const options = useMemo(() => getFieldOptions(data), [data]);

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
