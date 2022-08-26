import React, { useCallback, useState } from "react";

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
  const [isStartDatActive, setIsStartDateActive] = useState(true);

  const handleStartDateFocus = useCallback(() => {
    setIsStartDateActive(true);
  }, []);

  const handleEndDateFocus = useCallback(() => {
    setIsStartDateActive(false);
  }, []);

  const handleDateRangeChange = useCallback(
    (startValue: string | null, endValue: string | null) => {
      onFilterChange([op, field, startValue, endValue]);
    },
    [op, field, onFilterChange],
  );

  const handleStartDateChange = useCallback(
    (value: string | null) => {
      onFilterChange([op, field, value, endValue]);
    },
    [op, field, endValue, onFilterChange],
  );

  const handleEndDateChange = useCallback(
    (value: string | null) => {
      onFilterChange([op, field, startValue, value]);
    },
    [op, field, startValue, onFilterChange],
  );

  const handleEndDateClear = useCallback(() => {
    onFilterChange([
      op,
      field,
      setTimeComponent(startValue),
      setTimeComponent(endValue),
    ]);
  }, [op, field, startValue, endValue, onFilterChange]);

  return (
    <div className={className} data-testid="between-date-picker">
      <TimeContainer>
        <div>
          <SpecificDatePicker
            value={startValue}
            primaryColor={primaryColor}
            hideTimeSelectors={hideTimeSelectors}
            onChange={handleStartDateChange}
          />
        </div>
        <div>
          <SpecificDatePicker
            value={endValue}
            primaryColor={primaryColor}
            hideTimeSelectors={hideTimeSelectors}
            onChange={handleEndDateChange}
            onClear={handleEndDateClear}
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
          onChange={handleDateRangeChange}
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
