/* eslint-disable react/prop-types */
import React from "react";

import { SelectAll } from "metabase/components/Calendar";
import Filter from "metabase-lib/lib/queries/structured/Filter";
import { setTimeComponent } from "metabase/lib/query_time";
import SpecificDatePicker from "./SpecificDatePicker";

export type SingleDatePickerProps = {
  className?: string;
  filter: Filter;
  selectAll?: SelectAll;
  primaryColor?: string;
  onFilterChange: (filter: any[]) => void;

  hideTimeSelectors?: boolean;
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
    hideTimeSelectors={hideTimeSelectors}
    calendar
  />
);

export default SingleDatePicker;
