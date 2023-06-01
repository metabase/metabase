/* eslint-disable react/prop-types */
import cx from "classnames";
import { Option } from "metabase/core/components/Select";

import { SelectWithHighlightingIcon } from "./ChartSettingSelect.styled";

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
  <SelectWithHighlightingIcon
    className={cx(className, "block")}
    disabled={
      options.length === 0 ||
      (options.length === 1 && options[0].value === value)
    }
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
  </SelectWithHighlightingIcon>
);

export default ChartSettingSelect;
