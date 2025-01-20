import { MultiSelect } from "metabase/ui";

type Value = string[] | undefined;

interface ChartSettingMultiSelectProps {
  value: Value;
  onChange: (value: Value) => void;
  placeholder: string;
  placeholderNoOptions: string;
  options: { value: string; label: string }[];
}

export const ChartSettingMultiSelect = ({
  value,
  onChange,
  options = [],
  placeholder,
  placeholderNoOptions,
}: ChartSettingMultiSelectProps) => {
  const handleChange = (v: string[]) => {
    onChange(v);
  };
  return (
    <MultiSelect
      value={value}
      onChange={handleChange}
      placeholder={options.length === 0 ? placeholderNoOptions : placeholder}
      data={options}
      searchable
      aria-label={placeholder}
    />
  );
};
