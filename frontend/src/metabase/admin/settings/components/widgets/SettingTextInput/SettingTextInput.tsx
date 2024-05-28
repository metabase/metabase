import cx from "classnames";
import { useEffect, useState } from "react";

import AdminS from "metabase/css/admin.module.css";
import { TextInput } from "metabase/ui";

type Value = string | null;

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
  type: "text" | "password";
  normalize?: (value: Value) => Value;
}

const identity = (value: Value) => value;

export const SettingTextInput = ({
  setting,
  onChange,
  autoFocus,
  errorMessage,
  id,
  type = "text",
  normalize = identity,
}: SettingInputProps) => {
  const [valueState, setValueState] = useState<string>(setting.value ?? "");
  const changeHandler = (e: { target: HTMLInputElement }) => {
    const value = e.target.value;
    if (value !== (setting.value ?? "")) {
      onChange(normalize(value));
    }
  };

  useEffect(() => {
    setValueState(setting.value ?? "");
  }, [setting.value]);

  return (
    <TextInput
      className={cx({
        [AdminS.SettingsInput]: type !== "password",
        [AdminS.SettingsPassword]: type === "password",
      })}
      error={!!errorMessage}
      id={id}
      type={type}
      onChange={event => setValueState(event.target.value)}
      value={valueState}
      placeholder={setting.placeholder}
      onBlur={changeHandler}
      autoFocus={autoFocus}
    />
  );
};
