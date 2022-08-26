import React from "react";

import Calendar from "metabase/components/Calendar";

import moment from "moment-timezone";
import Filter from "metabase-lib/lib/queries/structured/Filter";
import { TimeContainer } from "./RangeDatePicker.styled";
import { setTimeComponent } from "metabase/lib/query_time";
import SingleDatePicker, { SingleDatePickerProps } from "./SingleDatePicker";
import SpecificDatePicker from "./SpecificDatePicker";

interface BetweenPickerProps {
  className?: string;
  filter: Filter;
  primaryColor?: string;
  hideTimeSelectors?: boolean;
  onFilterChange: (filter: any[]) => void;
}

export const BetweenPicker = ({
  className,
  filter: [op, field, startValue, endValue],
  primaryColor,
  hideTimeSelectors,
  onFilterChange,
}: BetweenPickerProps) => {
  return (
    <div className={className} data-testid="between-date-picker">
      <TimeContainer>
        <div>
          <SpecificDatePicker
            value={startValue}
            primaryColor={primaryColor}
            hideTimeSelectors={hideTimeSelectors}
            onChange={value => onFilterChange([op, field, value, endValue])}
          />
        </div>
        <div>
          <SpecificDatePicker
            value={endValue}
            primaryColor={primaryColor}
            hideTimeSelectors={hideTimeSelectors}
            onChange={value => onFilterChange([op, field, startValue, value])}
            onClear={() =>
              onFilterChange([
                op,
                field,
                setTimeComponent(startValue),
                setTimeComponent(endValue),
              ])
            }
          />
        </div>
      </TimeContainer>
      <div className="Calendar--noContext">
        <Calendar
          isRangePicker
          primaryColor={primaryColor}
          initial={startValue}
          selected={startValue && moment(startValue)}
          selectedEnd={endValue && moment(endValue)}
          onChange={(startValue, endValue) =>
            onFilterChange([op, field, startValue, endValue])
          }
        />
      </div>
    </div>
  );
};

export const BeforePicker = (props: SingleDatePickerProps) => {
  return <SingleDatePicker {...props} selectAll="before" />;
};

export const AfterPicker = (props: SingleDatePickerProps) => {
  return <SingleDatePicker {...props} selectAll="after" />;
};
