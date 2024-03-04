import type { SelectItem } from "metabase/ui";
import { MultiSelect, Select } from "metabase/ui";

interface SelectValuePickerProps {
  data: SelectItem[];
  value: string[];
  searchValue: string;
  placeholder: string;
  isAutoFocus: boolean;
  isMultiple: boolean;
  onChange: (newValues: string[]) => void;
  onSearchChange: (newSearchValue: string) => void;
}

export function SelectValuePicker({
  data,
  value,
  searchValue,
  placeholder,
  isAutoFocus,
  isMultiple,
  onChange,
  onSearchChange,
}: SelectValuePickerProps) {
  return isMultiple ? (
    <MultiSelect
      data={data}
      value={value}
      searchValue={searchValue}
      placeholder={placeholder}
      autoFocus={isAutoFocus}
      onChange={onChange}
      onSearchChange={onSearchChange}
    />
  ) : (
    <Select
      data={data}
      value={value[0]}
      searchValue={searchValue}
      placeholder={placeholder}
      autoFocus={isAutoFocus}
      onChange={value => onChange(value != null ? [value] : [])}
      onSearchChange={onSearchChange}
    />
  );
}
