import type { ChangeEvent } from "react";

import { TextInput } from "metabase/ui";

import { PickerIcon } from "../ParameterValuePicker.styled";
import { handleInputKeyup } from "../util";

interface PlainValueInputProps {
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder: string;
}

/**
 * It is intentional that this input is controlled from the outside
 * and doesn't have its own state.
 */
export function PlainValueInput(props: PlainValueInputProps) {
  const { value, onChange, placeholder } = props;

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange(event.currentTarget.value);
  };

  const icon = value ? (
    <PickerIcon name="close" onClick={() => onChange(null)} />
  ) : null;

  return (
    <TextInput
      value={value ?? ""} // required by Mantine
      onChange={handleChange}
      onKeyUp={handleInputKeyup}
      placeholder={placeholder}
      rightSection={icon}
    />
  );
}
