import React from "react";

import cx from "classnames";

const SettingText = ({
  setting,
  onChange,
  disabled,
  autoFocus,
  errorMessage,
  fireOnChange,
}) => (
  <textarea
    className={cx("AdminInput bordered rounded h3 SettingsInput", {
      "border-error bg-error-input": errorMessage,
    })}
    defaultValue={setting.value || ""}
    placeholder={setting.placeholder}
    onChange={fireOnChange ? e => onChange(e.target.value) : null}
    onBlur={!fireOnChange ? e => onChange(e.target.value) : null}
    autoFocus={autoFocus}
  />
);

export default SettingText;
