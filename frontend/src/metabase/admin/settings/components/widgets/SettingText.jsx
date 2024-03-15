/* eslint-disable react/prop-types */
import cx from "classnames";

import AdminS from "metabase/css/admin.module.css";

const SettingText = ({
  setting,
  onChange,
  disabled,
  autoFocus,
  errorMessage,
  fireOnChange,
}) => (
  <textarea
    className={cx(
      AdminS.AdminInput,
      AdminS.SettingsInput,
      "bordered rounded h3",
      {
        "border-error bg-error-input": errorMessage,
      },
    )}
    defaultValue={setting.value || ""}
    placeholder={setting.placeholder}
    onChange={fireOnChange ? e => onChange(e.target.value) : null}
    onBlur={!fireOnChange ? e => onChange(e.target.value) : null}
    autoFocus={autoFocus}
  />
);

export default SettingText;
