import React from "react";

import Select, { Option } from "metabase/components/Select";
import { pluralize, capitalize } from "humanize-plus";

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
  open,
  value,
  onChange,
  togglePicker,
  intervals,
  formatter,
  periods,
}: DateUnitSelectorProps) => (
  <Select
    value={value}
    onChange={e => onChange(e.target.value)}
    width={150}
    compact
  >
    {periods.map(period => (
      <Option value={period} key={period}>
        {capitalize(pluralize(formatter(intervals) || 1, period))}
      </Option>
    ))}
  </Select>
);

export default DateUnitSelector;
