import cx from "classnames";
import { SettingInputBlurChange } from "./SettingInput.styled";

const getValue = (value: string, type: string) => {
  if (type === "number") {
    const numericValue = parseFloat(value);
    return isNaN(numericValue) ? null : numericValue;
  }

  return value;
};

type Value = string | number | null;

export interface SettingInputProps {
  setting: {
    key: string;
    value: string | null;
    default?: string;
    placeholder?: string;
  };
  onChange: (value: Value) => void;
  autoFocus?: boolean;
  fireOnChange?: boolean;
  errorMessage?: string;
  id?: string;
  type?: string;
  normalize?: (value: Value) => Value;
}

const identity = (value: Value) => value;

export const SettingInput = ({
  setting,
  onChange,
  autoFocus,
  errorMessage,
  fireOnChange,
  id,
  type = "text",
  normalize = identity,
}: SettingInputProps) => {
  const changeHandler = (e: { target: HTMLInputElement }) => {
    const value = getValue(e.target.value, type);
    onChange(normalize(value));
  };

  return (
    <SettingInputBlurChange
      className={cx({
        SettingsInput: type !== "password",
        SettingsPassword: type === "password",
      })}
      normalize={normalize}
      size="large"
      error={!!errorMessage}
      id={id}
      type={type}
      value={setting.value || ""}
      placeholder={setting.placeholder}
      onChange={fireOnChange ? changeHandler : undefined}
      onBlurChange={!fireOnChange ? changeHandler : undefined}
      autoFocus={autoFocus}
    />
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default SettingInput;
