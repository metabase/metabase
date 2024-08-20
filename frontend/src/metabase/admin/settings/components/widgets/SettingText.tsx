/* eslint-disable react/prop-types */
import cx from "classnames";

import AdminS from "metabase/css/admin.module.css";
import CS from "metabase/css/core/index.css";
import type { TextareaProps } from "metabase/ui";

type SettingTextProps = {
  setting: {
    value: string;
    placeholder?: string;
  };
  onChange: (value: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  errorMessage?: string;
  fireOnChange?: boolean;
  className?: cx.Argument;
} & TextareaProps;

const SettingText = ({
  setting,
  onChange,
  disabled,
  autoFocus,
  errorMessage,
  fireOnChange,
  className,
  ...textareaProps
}: SettingTextProps) => {
  return (
    <textarea
      className={cx(
        className,
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
      {...textareaProps}
    />
  );
};

export default SettingText; // eslint-disable-line import/no-default-export
