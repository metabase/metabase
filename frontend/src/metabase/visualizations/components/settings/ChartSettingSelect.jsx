import React from "react";

import Select, { Option } from "metabase/components/Select.jsx";

import cx from "classnames";

const ChartSettingSelect = ({
  value,
  onChange,
  options = [],
  isInitiallyOpen,
  className,
  placeholder,
  placeholderNoOptions,
  ...props
}) => (
  <Select
    className={cx(className, "block flex-full", {
      disabled:
        options.length === 0 ||
        (options.length === 1 && options[0].value === value),
    })}
    value={value}
    onChange={e => onChange(e.target.value)}
    placeholder={options.length === 0 ? placeholderNoOptions : placeholder}
    isInitiallyOpen={isInitiallyOpen}
    {...props}
  >
    {options.map(option => (
      <Option key={option.value} name={option.name} value={option.value}>
        {option.name}
      </Option>
    ))}
  </Select>
);

export default ChartSettingSelect;
