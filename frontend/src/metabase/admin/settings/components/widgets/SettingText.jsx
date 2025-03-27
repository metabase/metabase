/* eslint-disable react/prop-types */
import cx from "classnames";

import AdminS from "metabase/css/admin.module.css";
import CS from "metabase/css/core/index.css";

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
      CS.bordered,
      CS.rounded,
      CS.h3,
      {
        [cx(CS.borderError, CS.bgErrorInput)]: errorMessage,
      },
    )}
    defaultValue={setting.value || setting.default || ""}
    placeholder={setting.placeholder}
    onChange={fireOnChange ? (e) => onChange(e.target.value) : null}
    onBlur={
      !fireOnChange
        ? (e) => {
            const value = setting.value || setting.default || "";
            const nextValue = e.target.value;
            if (nextValue !== value) {
              onChange(nextValue);
            }
          }
        : null
    }
    autoFocus={autoFocus}
  />
);

export default SettingText;
