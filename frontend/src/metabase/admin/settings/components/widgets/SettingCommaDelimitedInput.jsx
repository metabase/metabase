/* eslint-disable react/prop-types */
import React from "react";
import InputBlurChange from "metabase/components/InputBlurChange";
import cx from "classnames";

const SettingCommaDelimitedInput = ({
  setting,
  onChange,
  disabled,
  autoFocus,
  errorMessage,
  fireOnChange,
  id,
  type = "text",
}) => {
  return (
    <InputBlurChange
      className={cx("Form-input", {
        SettingsInput: true,
        "border-error bg-error-input": errorMessage,
      })}
      id={id}
      type={type}
      value={setting.value ? setting.value.join(",") : ""}
      placeholder={setting.placeholder}
      onChange={
        fireOnChange
          ? e => onChange(e.target.value.split(",").map(s => s.trim()))
          : null
      }
      onBlurChange={!fireOnChange ? e => onChange(e.target.value) : null}
      autoFocus={autoFocus}
    />
  );
};

export default SettingCommaDelimitedInput;
