import React from "react";

import Select, { Option } from "metabase/core/components/Select";
import { formatBucketing } from "metabase/lib/query_time";

const defaultDisplayName = (period: string, intervals: number) =>
  formatBucketing(period, intervals).toLowerCase();

type Props = {
  className?: string;
  value: number | string;
  onChange: (value: number | string) => void;
  intervals: number | string;
  formatter: (value: any) => any;
  formatDisplayName?: (period: string, intervals: number) => string;
  periods: string[];
  testId?: string;
};

const DateUnitSelector = ({
  className,
  value,
  onChange,
  intervals,
  formatter,
  formatDisplayName = defaultDisplayName,
  periods,
  testId,
}: Props) => (
  <Select
    className={className}
    value={value}
    onChange={(e: any) => onChange(e.target.value)}
    width={150}
    compact
    buttonProps={testId ? { "data-testid": testId } : undefined}
  >
    {periods.map(period => (
      <Option value={period} key={period}>
        {formatDisplayName(period, formatter(intervals) || 1)}
      </Option>
    ))}
  </Select>
);

export default DateUnitSelector;
