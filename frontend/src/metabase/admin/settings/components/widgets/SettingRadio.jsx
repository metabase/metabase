/* eslint-disable react/prop-types */
import cx from "classnames";

import Radio from "metabase/common/components/Radio";

const SettingRadio = ({ setting, onChange, disabled }) => (
  <Radio
    className={cx({ disabled: disabled })}
    value={setting.value}
    onChange={(value) => onChange(value)}
    options={Object.entries(setting.options).map(([value, name]) => ({
      name,
      value,
    }))}
  />
);

export default SettingRadio;
