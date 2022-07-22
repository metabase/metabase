/* eslint-disable react/prop-types */
import React from "react";

import Calendar from "metabase/components/Calendar";

import moment from "moment";
import Filter from "metabase-lib/lib/queries/structured/Filter";
import { TimeContainer } from "./RangeDatePicker.styled";
import {
  hasTimeComponent,
  setTimeComponent,
  TIME_SELECTOR_DEFAULT_HOUR,
  TIME_SELECTOR_DEFAULT_MINUTE,
} from "metabase/lib/query_time";
import SingleDatePicker, { SingleDatePickerProps } from "./SingleDatePicker";
import SpecificDatePicker from "./SpecificDatePicker";

type BetweenPickerProps = {
  className?: string;
  primaryColor?: string;
  filter: Filter;
  onFilterChange: (filter: any[]) => void;

  hideTimeSelectors?: boolean;
};

export const BetweenPicker = ({
  className,
  filter: [op, field, startValue, endValue],
  onFilterChange,
  hideTimeSelectors,
  primaryColor,
}: BetweenPickerProps) => {
  let endDatetime = endValue;
  if (hasTimeComponent(startValue) && !hasTimeComponent(endValue)) {
    endDatetime = setTimeComponent(
      endValue,
      TIME_SELECTOR_DEFAULT_HOUR,
      TIME_SELECTOR_DEFAULT_MINUTE,
    );
  }
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
