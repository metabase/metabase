import React, { useCallback, useState } from "react";
import moment, { Moment } from "moment-timezone";
import { setTimeComponent } from "metabase/lib/query_time";
import Calendar from "metabase/components/Calendar";
import Filter from "metabase-lib/lib/queries/structured/Filter";
import SingleDatePicker, { SingleDatePickerProps } from "./SingleDatePicker";
import SpecificDatePicker from "./SpecificDatePicker";
import { DateContainer, DateDivider } from "./RangeDatePicker.styled";

export interface BetweenPickerProps {
  className?: string;
  filter: Filter | any[];
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
  const [isStartDateActive, setIsStartDateActive] = useState(true);

  const handleStartDateFocus = useCallback(() => {
    setIsStartDateActive(true);
  }, []);

  const handleEndDateFocus = useCallback(() => {
    setIsStartDateActive(false);
  }, []);

  const handleDateClick = useCallback(
    (newValue: string, newDate: Moment) => {
      if (isStartDateActive) {
        onFilterChange([op, field, newValue, null]);
      } else if (newDate.isBefore(startValue)) {
        onFilterChange([op, field, newValue, startValue]);
      } else {
        onFilterChange([op, field, startValue, newValue]);
      }
      setIsStartDateActive(isActive => !isActive);
    },
    [op, field, startValue, isStartDateActive, onFilterChange],
  );

  const handleStartDateChange = useCallback(
    (newValue: string | null) => {
      onFilterChange([op, field, newValue, endValue]);
      setIsStartDateActive(isActive => !isActive);
    },
    [op, field, endValue, onFilterChange],
  );

  const handleEndDateChange = useCallback(
    (newValue: string | null) => {
      onFilterChange([op, field, startValue, newValue]);
      setIsStartDateActive(isActive => !isActive);
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
      <DateContainer>
        <SpecificDatePicker
          value={startValue}
          primaryColor={primaryColor}
          isActive={isStartDateActive}
          hideTimeSelectors={hideTimeSelectors}
          autoFocus
          onFocus={handleStartDateFocus}
          onChange={handleStartDateChange}
        />
        <DateDivider>–</DateDivider>
        <SpecificDatePicker
          value={endValue}
          primaryColor={primaryColor}
          isActive={!isStartDateActive}
          hideTimeSelectors={hideTimeSelectors}
          onFocus={handleEndDateFocus}
          onChange={handleEndDateChange}
          onClear={handleEndDateClear}
        />
      </DateContainer>
      <div className="Calendar--noContext">
        <Calendar
          isRangePicker
          primaryColor={primaryColor}
          initial={endValue}
          selected={startValue && moment(startValue)}
          selectedEnd={endValue && moment(endValue)}
          onChangeDate={handleDateClick}
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
