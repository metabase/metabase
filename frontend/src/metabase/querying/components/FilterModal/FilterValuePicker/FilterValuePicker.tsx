import { useMemo } from "react";
import { Checkbox, MultiSelect } from "metabase/ui";
import { useFieldValuesQuery } from "metabase/common/hooks";
import type { FieldValue } from "metabase-types/api";
import { MAX_INLINE_OPTIONS } from "./constants";
import { getFieldOptions, getStaticOptions } from "./utils";

interface FilterValuePickerProps {
  value: string[];
  placeholder: string;
  getCreateLabel: (query: string) => string | null;
  onChange: (newValue: string[]) => void;
}

export function FilterValuePicker({
  value,
  placeholder,
  getCreateLabel,
  onChange,
}: FilterValuePickerProps) {
  const { data = [] } = useFieldValuesQuery({
    id: 1,
  });

  if (data.length > 0 && data.length <= MAX_INLINE_OPTIONS) {
    return (
      <CheckboxValuePicker data={data} value={value} onChange={onChange} />
    );
  }

  return (
    <SelectValuePicker
      data={data}
      value={value}
      placeholder={placeholder}
      onChange={onChange}
      getCreateLabel={getCreateLabel}
    />
  );
}

interface CheckboxValuePickerProps {
  data: FieldValue[];
  value: string[];
  onChange: (newValue: string[]) => void;
}

function CheckboxValuePicker({
  data,
  value,
  onChange,
}: CheckboxValuePickerProps) {
  const options = useMemo(() => getFieldOptions(data), [data]);

  return (
    <Checkbox.Group value={value} onChange={onChange}>
      {options.map(option => (
        <Checkbox
          key={option.value}
          value={option.value}
          label={option.label}
        />
      ))}
    </Checkbox.Group>
  );
}

interface SelectValuePickerProps {
  data: FieldValue[];
  value: string[];
  placeholder: string;
  getCreateLabel: (value: string) => string | null;
  onChange: (newValue: string[]) => void;
}

function SelectValuePicker({
  data,
  value,
  placeholder,
  getCreateLabel,
  onChange,
}: SelectValuePickerProps) {
  const options = useMemo(
    () => (data.length > 0 ? getFieldOptions(data) : getStaticOptions(value)),
    [data, value],
  );

  return (
    <MultiSelect
      data={options}
      value={value}
      placeholder={placeholder}
      creatable
      searchable
      onChange={onChange}
      getCreateLabel={getCreateLabel}
      onCreate={query => {
        onChange([...value, query]);
        return query;
      }}
    />
  );
}
