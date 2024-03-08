import { t } from "ttag";

import { Select } from "metabase/ui";

import { PickerIcon } from "./ParameterValuePicker.styled";

export function ListInput(props: {
  value: string | string[];
  values: string[];
  onChange: (value: string) => void;
  onClear: () => void;
  placeholder: string;
  isSearchable: boolean;
}) {
  const { value, values, onChange, onClear, isSearchable, placeholder } = props;
  const singleValue = Array.isArray(value) ? value[0] : value;
  const icon = value ? <PickerIcon name="close" onClick={onClear} /> : null;

  return (
    <Select
      value={singleValue}
      data={values}
      onChange={onChange}
      rightSection={icon}
      placeholder={placeholder}
      searchable={isSearchable}
      nothingFound={t`Nothing found`}
      // TODO make dropdown maxHeight work (Select.styles.tsx)
      // maxDropdownHeight={300}
    />
  );
}
