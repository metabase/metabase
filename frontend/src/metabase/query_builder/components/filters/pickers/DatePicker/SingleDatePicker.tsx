/* eslint-disable react/prop-types */
import React from "react";

import { SelectAll } from "metabase/components/Calendar";
import { setTimeComponent } from "metabase/lib/query_time";
import Filter from "metabase-lib/lib/queries/structured/Filter";
import SpecificDatePicker from "./SpecificDatePicker";

export type SingleDatePickerProps = {
  className?: string;
  filter: Filter;
  selectAll?: SelectAll;
  primaryColor?: string;
  hideTimeSelectors?: boolean;
  onFilterChange: (filter: any[]) => void;
};

const SingleDatePicker = ({
  className,
  filter: [op, field, value],
  onFilterChange,
  hideTimeSelectors,
  selectAll,
  primaryColor,
}: SingleDatePickerProps) => (
  <SpecificDatePicker
    className={className}
    value={value}
    primaryColor={primaryColor}
    selectAll={selectAll}
    onChange={value => onFilterChange([op, field, value])}
    onClear={() => onFilterChange([op, field, setTimeComponent(value)])}
    autoFocus
    hasCalendar
    hideTimeSelectors={hideTimeSelectors}
  />
);

export default SingleDatePicker;
