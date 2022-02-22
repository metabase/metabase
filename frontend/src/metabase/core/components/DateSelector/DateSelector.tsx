import React, {
  ChangeEvent,
  CSSProperties,
  forwardRef,
  Ref,
  useCallback,
  useMemo,
  useState,
} from "react";
import moment, { Duration, Moment } from "moment-timezone";
import { t } from "ttag";
import { hasTimePart } from "metabase/lib/time";
import Select from "metabase/core/components/Select";
import TimeInput from "metabase/core/components/TimeInput";
import Calendar from "metabase/components/Calendar";
import {
  SelectorContent,
  SelectorField,
  SelectorFieldLabel,
  SelectorFooter,
  SelectorSubmitButton,
  SelectorTimeButton,
} from "./DateSelector.styled";

const DATE_FORMAT = "YYYY-MM-DD";

export interface DateSelectorProps {
  className?: string;
  style?: CSSProperties;
  date?: Moment;
  hasTime?: boolean;
  timezone?: string;
  timezones?: string[];
  hasTimezone?: boolean;
  onChangeDate?: (date?: Moment) => void;
  onChangeTimezone?: (timezone: string) => void;
  onSubmit?: () => void;
}

const DateSelector = forwardRef(function DateSelector(
  {
    className,
    style,
    date,
    hasTime,
    timezone = moment.tz.guess(),
    timezones,
    hasTimezone,
    onChangeDate,
    onChangeTimezone,
    onSubmit,
  }: DateSelectorProps,
  ref: Ref<HTMLDivElement>,
): JSX.Element {
  const [isTimeShown, setIsTimeShown] = useState(hasTime && hasTimePart(date));

  const time = useMemo(() => {
    return moment.duration({
      hours: date?.hours(),
      minutes: date?.minutes(),
    });
  }, [date]);

  const timezoneOptions = useMemo(() => {
    return timezones?.map(timezone => ({ name: timezone, value: timezone }));
  }, [timezones]);

  const handleDateChange = useCallback(
    (dateString: string) => {
      const newDate = moment.tz(dateString, DATE_FORMAT, timezone);
      newDate.hours(date ? date.hours() : 0);
      newDate.minutes(date ? date.minutes() : 0);
      onChangeDate?.(newDate);
    },
    [date, timezone, onChangeDate],
  );

  const handleTimeChange = useCallback(
    (newTime?: Duration) => {
      const newDate = date ? date.clone() : moment.tz(timezone).startOf("date");
      newDate.hours(newTime ? newTime.hours() : 0);
      newDate.minutes(newTime ? newTime.minutes() : 0);
      onChangeDate?.(newDate);
      setIsTimeShown(newTime != null);
    },
    [date, timezone, onChangeDate],
  );

  const handleTimeClick = useCallback(() => {
    const newDate = date ? date.clone() : moment.tz(timezone).startOf("date");
    onChangeDate?.(newDate);
    setIsTimeShown(true);
  }, [date, timezone, onChangeDate]);

  const handleTimezoneChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      onChangeTimezone?.(event.target.value);
    },
    [onChangeTimezone],
  );

  return (
    <div ref={ref} className={className} style={style}>
      <Calendar
        initial={date}
        selected={date}
        isRangePicker={false}
        onChange={handleDateChange}
      />
      <SelectorContent>
        {isTimeShown && (
          <SelectorField>
            <TimeInput value={time} onChange={handleTimeChange} />
          </SelectorField>
        )}
        {isTimeShown && hasTimezone && (
          <SelectorField>
            <SelectorFieldLabel>{t`Timezone`}</SelectorFieldLabel>
            <Select
              value={timezone}
              options={timezoneOptions}
              searchProp="name"
              onChange={handleTimezoneChange}
            />
          </SelectorField>
        )}
        <SelectorFooter>
          {hasTime && !isTimeShown && (
            <SelectorTimeButton
              icon="clock"
              borderless
              onClick={handleTimeClick}
            >
              {t`Add time`}
            </SelectorTimeButton>
          )}
          <SelectorSubmitButton primary onClick={onSubmit}>
            {t`Save`}
          </SelectorSubmitButton>
        </SelectorFooter>
      </SelectorContent>
    </div>
  );
});

export default DateSelector;
