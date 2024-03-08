import type { Moment } from "moment-timezone"; // eslint-disable-line no-restricted-imports -- deprecated usage
import moment from "moment-timezone"; // eslint-disable-line no-restricted-imports -- deprecated usage
import type { CSSProperties, Ref } from "react";
import { forwardRef, useCallback, useMemo } from "react";
import { t } from "ttag";

import Calendar from "metabase/components/Calendar";
import TimeInput from "metabase/core/components/TimeInput";

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
  timeFormat?: string;
  onChange?: (date?: Moment) => void;
  onHasTimeChange?: (hasTime: boolean) => void;
  onSubmit?: () => void;
}

const DateSelector = forwardRef(function DateSelector(
  {
    className,
    style,
    value,
    hasTime,
    timeFormat,
    onChange,
    onHasTimeChange,
    onSubmit,
  }: DateSelectorProps,
  ref: Ref<HTMLDivElement>,
): JSX.Element {
  const today = useMemo(() => moment().startOf("date"), []);

  const handleDateChange = useCallback(
    (unused1: string, unused2: string | null, date: Moment) => {
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
    onHasTimeChange?.(true);
  }, [value, today, onChange, onHasTimeChange]);

  const handleTimeClear = useCallback(
    (newValue: Moment) => {
      onChange?.(newValue);
      onHasTimeChange?.(false);
    },
    [onChange, onHasTimeChange],
  );

  return (
    <div ref={ref} className={className} style={style}>
      <Calendar
        initial={value}
        selected={value}
        isRangePicker={false}
        onChange={handleDateChange}
      />
      {value && hasTime && (
        <SelectorTimeContainer>
          <TimeInput
            value={value}
            timeFormat={timeFormat}
            onChange={onChange}
            onClear={handleTimeClear}
          />
        </SelectorTimeContainer>
      )}
      <SelectorFooter>
        {!hasTime && (
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DateSelector;
