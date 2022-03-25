/* eslint-disable react/prop-types */
import React from "react";

import Select, { Option } from "metabase/core/components/Select";
import { formatBucketing } from "metabase/lib/query_time";

type Props = {
  className?: string;
  value: number | string;
  onChange: (value: number | string) => void;
  intervals: number | string;
  formatter: (value: any) => any;
  periods: string[];
};

const DateUnitSelector = ({
  className,
  value,
  onChange,
  intervals,
  formatter,
  periods,
}: Props) => (
  <Select
    className={className}
    value={value}
    onChange={(e: any) => onChange(e.target.value)}
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
