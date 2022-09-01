/* eslint-disable react/prop-types */
import React from "react";

import Radio from "metabase/core/components/Radio";
import cx from "classnames";
import { SettingPlaceholder } from "./SettingRadio.styled";

const SettingRadio = ({ setting, onChange, disabled }) => {
  if (setting.is_env_setting) {
    return <SettingPlaceholder>{setting.placeholder}</SettingPlaceholder>;
  }

  return (
    <Radio
      className={cx({ disabled: disabled })}
      value={setting.value}
      onChange={value => onChange(value)}
      options={Object.entries(setting.options).map(([value, name]) => ({
        name,
        value,
      }))}
    />
  );
};

export default SettingRadio;
