import { useMemo } from "react";
import * as Lib from "metabase-lib";
import { Checkbox, MultiSelect, SimpleGrid } from "metabase/ui";
import { useFieldValuesQuery } from "metabase/common/hooks";
import type { FieldValue } from "metabase-types/api";
import { MAX_INLINE_OPTIONS } from "./constants";
import { getFieldOptions, getStaticOptions } from "./utils";

interface FilterValuePickerProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  value: string[];
  placeholder: string;
  getCreateLabel: (query: string) => string | null;
  onChange: (newValue: string[]) => void;
}

export function FilterValuePicker({
  query,
  stageIndex,
  column,
  value,
  placeholder,
  getCreateLabel,
  onChange,
}: FilterValuePickerProps) {
  const { fieldId, hasFieldValues } = Lib.fieldValuesInfo(
    query,
    stageIndex,
    column,
  );

  const { data = [] } = useFieldValuesQuery({
    id: fieldId != null ? fieldId : undefined,
    enabled: hasFieldValues === "list",
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
  const options =
    data.length > 0 ? getFieldOptions(data) : getStaticOptions(value);

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
