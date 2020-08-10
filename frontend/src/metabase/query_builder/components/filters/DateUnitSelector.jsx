import React from "react";

import Select, { Option } from "metabase/components/Select";
import { formatBucketing } from "metabase/lib/query_time";

type DateUnitSelectorProps = {
  value: RelativeDatetimeUnit,
  onChange: (value: RelativeDatetimeUnit) => void,
  open: boolean,
  intervals?: number,
  togglePicker: () => void,
  formatter: (value: ?number) => ?number,
  periods: RelativeDatetimeUnit[],
};

const DateUnitSelector = ({
  className,
  open,
  value,
  onChange,
  togglePicker,
  intervals,
  formatter,
  periods,
}: DateUnitSelectorProps) => (
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
