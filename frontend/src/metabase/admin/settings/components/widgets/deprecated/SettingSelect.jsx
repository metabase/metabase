/* eslint-disable react/prop-types */
import cx from "classnames";

import Select, { Option } from "metabase/core/components/Select";
import AdminS from "metabase/css/admin.module.css";

/**
 * @deprecated use Select from "metabase/admin/settings/components/widgets/SettingSelect" instead
 */
const SettingSelect = ({
  className = "",
  setting: { placeholder, value, options, defaultValue, searchProp, key },
  options: customOptions = options,
  onChange,
  disabled = false,
}) => (
  <Select
    className={cx(AdminS.SettingsInput, className)}
    placeholder={placeholder}
    value={value}
    defaultValue={defaultValue}
    disabled={disabled}
    searchProp={searchProp}
    onChange={e => onChange(e.target.value)}
    buttonProps={{
      dataTestId: key,
    }}
  >
    {customOptions.map(option => {
      const name = typeof option === "object" ? option.name : option;
      const value = typeof option === "object" ? option.value : option;
      return (
        <Option key={value} name={name} value={value}>
          {name}
        </Option>
      );
    })}
  </Select>
);

export default SettingSelect;
