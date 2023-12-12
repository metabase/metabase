import type { SettingInputProps } from "../SettingInput";

import SettingInput from "../SettingInput";

type Value = string | number | null;

export function NormalizedTextSettingInput({
  setting,
  onChange,
  autoFocus,
  errorMessage,
  fireOnChange,
  id,
  type = "text",
}: SettingInputProps) {
  function handleChange(value: Value) {
    if (type === "text" && typeof value === "string") {
      const normalizedValue = value.trim();
      return normalizedValue === ""
        ? onChange(null)
        : onChange(normalizedValue);
    }

    return onChange(value);
  }

  return (
    <SettingInput
      setting={setting}
      onChange={handleChange}
      autoFocus={autoFocus}
      errorMessage={errorMessage}
      fireOnChange={fireOnChange}
      id={id}
      type={type}
    />
  );
}
