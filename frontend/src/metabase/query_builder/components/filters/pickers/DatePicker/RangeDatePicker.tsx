/* eslint-disable react/prop-types */
import React from "react";

import Calendar from "metabase/components/Calendar";

import moment from "moment";
import Filter from "metabase-lib/lib/queries/structured/Filter";
import { TimeContainer } from "./RangeDatePicker.styled";
import { setTimeComponent } from "metabase/lib/query_time";
import SingleDatePicker, { SingleDatePickerProps } from "./SingleDatePicker";
import SpecificDatePicker from "./SpecificDatePicker";

type BetweenPickerProps = {
  isSidebar?: boolean;
  className?: string;
  filter: Filter;
  onFilterChange: (filter: any[]) => void;

  hideTimeSelectors?: boolean;
};

export const BetweenPicker = ({
  className,
  isSidebar,
  filter: [op, field, startValue, endValue],
  onFilterChange,
  hideTimeSelectors,
}: BetweenPickerProps) => (
  <div className={className}>
    <TimeContainer isSidebar={isSidebar}>
      <div>
        <SpecificDatePicker
          value={startValue}
          hideTimeSelectors={hideTimeSelectors}
          onChange={value => onFilterChange([op, field, value, endValue])}
        />
      </div>
      <div>
        <SpecificDatePicker
          value={endValue}
          hideTimeSelectors={hideTimeSelectors}
          onClear={() =>
            onFilterChange([
              op,
              field,
              setTimeComponent(startValue),
              setTimeComponent(endValue),
            ])
          }
          onChange={value => onFilterChange([op, field, startValue, value])}
        />
      </div>
    </TimeContainer>
    <div className="Calendar--noContext">
      <Calendar
        isRangePicker
        initial={startValue ? moment(startValue) : moment()}
        selected={startValue && moment(startValue)}
        selectedEnd={endValue && moment(endValue)}
        onChange={(startValue, endValue) =>
          onFilterChange([op, field, startValue, endValue])
        }
      />
    </div>
  </div>
);

export const BeforePicker = (props: SingleDatePickerProps) => {
  return <SingleDatePicker {...props} selectAll="before" />;
};

export const AfterPicker = (props: SingleDatePickerProps) => {
  return <SingleDatePicker {...props} selectAll="after" />;
};
