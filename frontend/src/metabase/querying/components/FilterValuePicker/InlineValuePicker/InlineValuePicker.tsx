import { useMemo } from "react";
import { Checkbox, SimpleGrid } from "metabase/ui";
import type { FieldValue } from "metabase-types/api";
import { getFieldOptions } from "../utils";

interface InlineValuePickerProps {
  data: FieldValue[];
  value: string[];
  onChange: (newValue: string[]) => void;
}

export function InlineValuePicker({
  data,
  value,
  onChange,
}: InlineValuePickerProps) {
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
