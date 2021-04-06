/* eslint-disable react/prop-types */
import React from "react";

import Select, { Option } from "metabase/components/Select";

const SettingSelect = ({
  setting: { placeholder, value, options, defaultValue, searchProp },
  onChange,
  disabled,
}) => (
  <Select
    className="full-width"
    placeholder={placeholder}
    value={value}
    defaultValue={defaultValue}
    searchProp={searchProp}
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
