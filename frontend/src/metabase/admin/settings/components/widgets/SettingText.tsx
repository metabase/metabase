import cx from "classnames";

import AdminS from "metabase/css/admin.module.css";
import CS from "metabase/css/core/index.css";

interface SettingTextProps {
  setting: {
    value?: string;
    placeholder?: string;
  };
  onChange: (value: string) => void;
  autoFocus?: boolean;
  errorMessage?: string;
  fireOnChange?: boolean;
}

const SettingText = ({
  setting,
  onChange,
  autoFocus,
  errorMessage,
  fireOnChange,
}: SettingTextProps) => (
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
    defaultValue={setting.value || ""}
    placeholder={setting.placeholder}
    onChange={fireOnChange ? e => onChange(e.target.value) : undefined}
    onBlur={!fireOnChange ? e => onChange(e.target.value) : undefined}
    autoFocus={autoFocus}
  />
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default SettingText;
