import { useCallback, useState } from "react";
import moment, { Moment } from "moment-timezone";
import Calendar from "metabase/components/Calendar";
import Filter from "metabase-lib/queries/structured/Filter";
import {
  clearDateRangeFilterTime,
  getDateRangeFilterValue,
  setDateRangeFilterValue,
} from "metabase-lib/queries/utils/date-filters";
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
  filter,
  primaryColor,
  hideTimeSelectors,
  onFilterChange,
}: BetweenPickerProps) => {
  const [startValue, endValue] = getDateRangeFilterValue(filter);
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
        onFilterChange(setDateRangeFilterValue(filter, [newValue, null]));
      } else if (newDate.isBefore(startValue)) {
        onFilterChange(setDateRangeFilterValue(filter, [newValue, startValue]));
      } else {
        onFilterChange(setDateRangeFilterValue(filter, [startValue, newValue]));
      }
      setIsStartDateActive(isActive => !isActive);
    },
    [filter, startValue, isStartDateActive, onFilterChange],
  );

  const handleStartDateChange = useCallback(
    (newValue: string | null) => {
      onFilterChange(setDateRangeFilterValue(filter, [newValue, endValue]));
      setIsStartDateActive(isActive => !isActive);
    },
    [filter, endValue, onFilterChange],
  );

  const handleEndDateChange = useCallback(
    (newValue: string | null) => {
      onFilterChange(setDateRangeFilterValue(filter, [startValue, newValue]));
      setIsStartDateActive(isActive => !isActive);
    },
    [filter, startValue, onFilterChange],
  );

  const handleEndDateClear = useCallback(() => {
    onFilterChange(clearDateRangeFilterTime(filter));
  }, [filter, onFilterChange]);

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
