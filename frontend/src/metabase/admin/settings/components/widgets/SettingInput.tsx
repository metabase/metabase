import React from "react";

import InputBlurChange from "metabase/components/InputBlurChange";
import cx from "classnames";

const getValue = (value: string, type: string) => {
  if (type === "number") {
    const numericValue = parseFloat(value);
    return isNaN(numericValue) ? null : numericValue;
  }

  return value;
};

interface SettingInputProps {
  setting: {
    key: string;
    value: string | null;
    default?: string;
    placeholder?: string;
  };
  onChange: (value: string | number | null) => void;
  autoFocus?: boolean;
  fireOnChange?: boolean;
  errorMessage?: string;
  id?: string;
  type?: string;
}

const SettingInput = ({
  setting,
  onChange,
  autoFocus,
  errorMessage,
  fireOnChange,
  id,
  type = "text",
}: SettingInputProps) => {
  const changeHandler = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = getValue(e.target.value, type);
    onChange(value);
  };

  return (
    <InputBlurChange
      className={cx("Form-input", {
        SettingsInput: type !== "password",
        SettingsPassword: type === "password",
        "border-error bg-error-input": errorMessage,
      })}
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

export default SettingInput;
