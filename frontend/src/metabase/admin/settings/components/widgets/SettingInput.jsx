/* eslint-disable react/prop-types */
import React from "react";

import InputBlurChange from "metabase/components/InputBlurChange";
import cx from "classnames";

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
    onChange={fireOnChange ? e => onChange(e.target.value) : null}
    onBlurChange={!fireOnChange ? e => onChange(e.target.value) : null}
    autoFocus={autoFocus}
  />
);

export default SettingInput;
