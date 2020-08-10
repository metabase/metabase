import React from "react";

import Select, { Option } from "metabase/components/Select";

import cx from "classnames";

const ChartSettingSelect = ({
  // Use null if value is undefined. If we pass undefined, Select will create an
  // uncontrolled component because it's wrapped with Uncontrollable.
  value = null,
  onChange,
  options = [],
  isInitiallyOpen,
  className,
  placeholder,
  placeholderNoOptions,
  ...props
}) => (
  <Select
    className={cx(className, "block", {
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
