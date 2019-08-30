import React from "react";

import Select, { Option } from "metabase/components/Select";

const SettingSelect = ({
  setting: { placeholder, value, options, defaultValue },
  onChange,
  disabled,
}) => (
  <Select
    className="full-width"
    placeholder={placeholder}
    value={value}
    defaultValue={defaultValue}
    onChange={e => onChange(e.target.value)}
  >
    {options.map(option => {
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
