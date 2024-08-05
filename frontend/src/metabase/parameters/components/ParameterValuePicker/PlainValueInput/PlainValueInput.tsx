import type { ChangeEvent } from "react";
import { t } from "ttag";

import { TextInput } from "metabase/ui";

import { PickerIcon } from "../ParameterValuePicker.styled";
import { blurOnCommitKey } from "../utils";

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
    <PickerIcon
      aria-label={t`Clear`}
      name="close"
      onClick={() => onChange(null)}
    />
  ) : null;

  return (
    <TextInput
      value={value ?? ""} // required by Mantine
      onChange={handleChange}
      // Values are "committed" immediately because it's controlled from the outside
      onKeyUp={blurOnCommitKey}
      placeholder={placeholder}
      rightSection={icon}
    />
  );
}
