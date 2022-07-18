/* eslint-disable react/prop-types */
import React from "react";

import InputBlurChange from "metabase/components/InputBlurChange";
import cx from "classnames";

const getValue = (value, type) => {
  if (type === "number") {
    const numericValue = parseInt(value);
    return isNaN(numericValue) ? null : numericValue;
  }

  return value;
};

const SettingInput = ({
  setting,
  onChange,
  disabled,
  autoFocus,
  errorMessage,
  fireOnChange,
  id,
  type = "text",
}) => (
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
    onChange={
      fireOnChange ? e => onChange(getValue(e.target.value, type)) : null
    }
    onBlurChange={
      !fireOnChange ? e => onChange(getValue(e.target.value, type)) : null
    }
    autoFocus={autoFocus}
  />
);

export default SettingInput;
