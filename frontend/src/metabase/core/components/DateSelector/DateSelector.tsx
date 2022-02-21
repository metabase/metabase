import React, { forwardRef, Ref, useCallback } from "react";
import moment, { Duration, Moment } from "moment";
import Calendar from "metabase/components/Calendar";
import TimeInput from "metabase/core/components/TimeInput";

export interface DateSelectorProps {
  date?: Moment;
  onChangeDate?: (date?: Moment) => void;
}

const DateSelector = forwardRef(function DateSelector(
  { date, onChangeDate }: DateSelectorProps,
  ref: Ref<HTMLDivElement>,
): JSX.Element {
  const time = moment.duration({
    hours: date?.hours(),
    minutes: date?.minutes(),
  });

  const handleDateChange = useCallback(
    (unused1: string, unused2: string, dateStart: Moment) => {
      const newDate = dateStart.clone();
      newDate.hours(date ? date.hours() : 0);
      newDate.minutes(date ? date.minutes() : 0);
      onChangeDate?.(newDate);
    },
    [date, onChangeDate],
  );

  const handleTimeChange = useCallback(
    (newTime?: Duration) => {
      const newDate = date ? date.clone() : moment();
      newDate.hours(newTime ? newTime.hours() : 0);
      newDate.minutes(newTime ? newTime.minutes() : 0);
      onChangeDate?.(newDate);
    },
    [date, onChangeDate],
  );

  return (
    <div ref={ref}>
      <Calendar initial={date} selected={date} onChange={handleDateChange} />
      <TimeInput value={time} onChange={handleTimeChange} />
    </div>
  );
});

export default DateSelector;
