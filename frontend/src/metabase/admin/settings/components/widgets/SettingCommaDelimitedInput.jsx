/* eslint-disable react/prop-types */
import React from "react";
import InputBlurChange from "metabase/components/InputBlurChange";
import cx from "classnames";

const maybeSingletonList = value => (value ? [value] : null);

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
      // TOOD: change this to support multiple email addresses
      // https://github.com/metabase/metabase/issues/22540
      value={setting.value ? setting.value[0] : ""}
      placeholder={setting.placeholder}
      // If the input's value is empty, setting.value should be null
      onChange={
        fireOnChange ? e => onChange(maybeSingletonList(e.target.value)) : null
      }
      onBlurChange={
        !fireOnChange ? e => onChange(maybeSingletonList(e.target.value)) : null
      }
      autoFocus={autoFocus}
    />
  );
};

export default SettingCommaDelimitedInput;
