import React from "react";

import InputBlurChange from "metabase/components/InputBlurChange.jsx";
import cx from "classnames";

const SettingInput = ({
  setting,
  onChange,
  disabled,
  autoFocus,
  errorMessage,
  fireOnChange,
  type = "text",
}) => (
  <InputBlurChange
    className={cx(" AdminInput bordered rounded h3", {
      SettingsInput: type !== "password",
      SettingsPassword: type === "password",
      "border-error bg-error-input": errorMessage,
    })}
    type={type}
    value={setting.value || ""}
    placeholder={setting.placeholder}
    onChange={fireOnChange ? e => onChange(e.target.value) : null}
    onBlurChange={!fireOnChange ? e => onChange(e.target.value) : null}
    autoFocus={autoFocus}
  />
);

export default SettingInput;
