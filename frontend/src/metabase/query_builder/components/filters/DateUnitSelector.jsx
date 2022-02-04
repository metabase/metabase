/* eslint-disable react/prop-types */
import React from "react";

import Select, { Option } from "metabase/components/Select";
import { formatBucketing } from "metabase/lib/query_time";

const DateUnitSelector = ({
  className,
  open,
  value,
  onChange,
  togglePicker,
  intervals,
  formatter,
  periods,
}) => (
  <Select
    className={className}
    value={value}
    onChange={e => onChange(e.target.value)}
    width={150}
    compact
  >
    {periods.map(period => (
      <Option value={period} key={period}>
        {formatBucketing(period, formatter(intervals) || 1)}
      </Option>
    ))}
  </Select>
);

export default DateUnitSelector;
