import React, {
  CSSProperties,
  forwardRef,
  Ref,
  useCallback,
  useMemo,
  useState,
} from "react";
import moment, { Moment } from "moment";
import { t } from "ttag";
import { hasTimePart } from "metabase/lib/time";
import TimeInput from "metabase/core/components/TimeInput";
import Calendar from "metabase/components/Calendar";
import {
  SelectorFooter,
  SelectorSubmitButton,
  SelectorTimeButton,
  SelectorTimeContainer,
} from "./DateSelector.styled";

export interface DateSelectorProps {
  className?: string;
  style?: CSSProperties;
  value?: Moment;
  hasTime?: boolean;
  is24HourMode?: boolean;
  onChange?: (date?: Moment) => void;
  onSubmit?: () => void;
}

const DateSelector = forwardRef(function DateSelector(
  {
    className,
    style,
    value,
    hasTime,
    is24HourMode,
    onChange,
    onSubmit,
  }: DateSelectorProps,
  ref: Ref<HTMLDivElement>,
): JSX.Element {
  const today = useMemo(() => moment().startOf("date"), []);
  const [isTimeShown, setIsTimeShown] = useState(hasTime && hasTimePart(value));

  const handleDateChange = useCallback(
    (unused1: string, unused2: string, date: Moment) => {
      const newDate = date.clone();
      newDate.hours(value?.hours() ?? 0);
      newDate.minutes(value?.minutes() ?? 0);
      onChange?.(newDate);
    },
    [value, onChange],
  );

  const handleTimeClick = useCallback(() => {
    const newValue = value ?? today;
    onChange?.(newValue);
    setIsTimeShown(true);
  }, [value, today, onChange]);

  const handleTimeClear = useCallback(
    (newValue: Moment) => {
      onChange?.(newValue);
      setIsTimeShown(false);
    },
    [onChange],
  );

  return (
    <div ref={ref} className={className} style={style}>
      <Calendar
        initial={value}
        selected={value}
        isRangePicker={false}
        onChange={handleDateChange}
      />
      {value && isTimeShown && (
        <SelectorTimeContainer>
          <TimeInput
            value={value}
            is24HourMode={is24HourMode}
            onChange={onChange}
            onClear={handleTimeClear}
          />
        </SelectorTimeContainer>
      )}
      <SelectorFooter>
        {hasTime && !isTimeShown && (
          <SelectorTimeButton icon="clock" borderless onClick={handleTimeClick}>
            {t`Add time`}
          </SelectorTimeButton>
        )}
        <SelectorSubmitButton primary onClick={onSubmit}>
          {t`Done`}
        </SelectorSubmitButton>
      </SelectorFooter>
    </div>
  );
});

export default DateSelector;
