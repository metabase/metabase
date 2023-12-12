import { MultiSelect } from "metabase/ui";

interface FilterValuePickerProps {
  values: string[];
  placeholder: string;
  getCreateLabel: (value: string) => string | null;
  onChange: (newValues: string[]) => void;
}

export function FilterValuePicker({
  values,
  placeholder,
  getCreateLabel,
  onChange,
}: FilterValuePickerProps) {
  return (
    <MultiSelect
      data={values}
      value={values}
      placeholder={placeholder}
      creatable
      searchable
      onChange={onChange}
      getCreateLabel={getCreateLabel}
      onCreate={query => {
        onChange([...values, query]);
        return query;
      }}
    />
  );
}
