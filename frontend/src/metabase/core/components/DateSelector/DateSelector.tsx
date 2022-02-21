import React, { forwardRef, Ref, useCallback, useMemo, useState } from "react";
import moment, { Duration, Moment } from "moment";
import { t } from "ttag";
import TimeInput from "metabase/core/components/TimeInput";
import Calendar from "metabase/components/Calendar";
import {
  SelectorFooter,
  SelectorSubmitButton,
  SelectorTimeButton,
  SelectorTimeContainer,
} from "./DateSelector.styled";
import { hasTime } from "metabase/lib/time";

export interface DateSelectorProps {
  date?: Moment;
  onChangeDate?: (date?: Moment) => void;
  onSubmit?: () => void;
}

const DateSelector = forwardRef(function DateSelector(
  { date, onChangeDate, onSubmit }: DateSelectorProps,
  ref: Ref<HTMLDivElement>,
): JSX.Element {
  const [isTimeShown, setIsTimeShown] = useState(() => hasTime(date));

  const time = useMemo(() => {
    return moment.duration({
      hours: date?.hours(),
      minutes: date?.minutes(),
    });
  }, [date]);

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
      const newDate = date ? date.clone() : moment().startOf("date");
      newDate.hours(newTime ? newTime.hours() : 0);
      newDate.minutes(newTime ? newTime.minutes() : 0);
      onChangeDate?.(newDate);
      setIsTimeShown(newTime != null);
    },
    [date, onChangeDate],
  );

  const handleTimeClick = useCallback(() => {
    const newDate = date ? date.clone() : moment().startOf("date");
    onChangeDate?.(newDate);
    setIsTimeShown(true);
  }, [date, onChangeDate]);

  return (
    <div ref={ref}>
      <Calendar
        initial={date}
        selected={date}
        isRangePicker={false}
        onChange={handleDateChange}
      />
      {isTimeShown && (
        <SelectorTimeContainer>
          <TimeInput value={time} onChange={handleTimeChange} />
        </SelectorTimeContainer>
      )}
      <SelectorFooter>
        {!isTimeShown && (
          <SelectorTimeButton icon="clock" borderless onClick={handleTimeClick}>
            {t`Add time`}
          </SelectorTimeButton>
        )}
        <SelectorSubmitButton primary onClick={onSubmit}>
          {t`Save`}
        </SelectorSubmitButton>
      </SelectorFooter>
    </div>
  );
});

export default DateSelector;
