import React from "react";

import Radio from "metabase/components/Radio";
import cx from "classnames";

const SettingRadio = ({ setting, onChange, disabled }) => (
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

export default SettingRadio;
