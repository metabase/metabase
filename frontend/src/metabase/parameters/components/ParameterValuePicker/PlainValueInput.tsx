import type { ChangeEvent, KeyboardEvent } from "react";

import { TextInput } from "metabase/ui";

import { TextInputIcon } from "./ParameterValuePicker.styled";

interface PlainValueInputProps {
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
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

  const handleKeyup = (event: KeyboardEvent<HTMLInputElement>) => {
    const target = event.target as HTMLInputElement;
    switch (event.key) {
      // Values are "committed" immediately because it's controlled from the outside
      case "Enter":
      case "Escape":
        target.blur();
    }
  };

  const icon = value ? (
    <TextInputIcon name="close" onClick={() => onChange(null)} />
  ) : null;

  return (
    <TextInput
      value={value ?? ""} // required by Mantine
      onChange={handleChange}
      onKeyUp={handleKeyup}
      placeholder={placeholder}
      rightSection={icon}
    />
  );
}
