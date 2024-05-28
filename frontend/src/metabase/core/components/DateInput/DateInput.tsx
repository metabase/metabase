import type { Moment } from "moment-timezone"; // eslint-disable-line no-restricted-imports -- deprecated usage
import moment from "moment-timezone"; // eslint-disable-line no-restricted-imports -- deprecated usage
import type {
  ChangeEvent,
  FocusEvent,
  InputHTMLAttributes,
  MouseEvent,
  Ref,
} from "react";
import { forwardRef, useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import Input from "metabase/core/components/Input";

const DATE_FORMAT = "MM/DD/YYYY";
const TIME_FORMAT_12 = "h:mm A";
const TIME_FORMAT_24 = "HH:mm";

export type DateInputAttributes = Omit<
  InputHTMLAttributes<HTMLDivElement>,
  "size" | "value" | "onChange"
>;

export interface DateInputProps extends DateInputAttributes {
  value?: Moment;
  inputRef?: Ref<HTMLInputElement>;
  hasTime?: boolean;
  hasCalendar?: boolean;
  dateFormat?: string;
  timeFormat?: string;
  error?: boolean;
  fullWidth?: boolean;
  onChange?: (value?: Moment) => void;
  onCalendarClick?: (event: MouseEvent<HTMLButtonElement>) => void;
}

const DateInput = forwardRef(function DateInput(
  {
    value,
    inputRef,
    placeholder,
    hasTime,
    hasCalendar,
    dateFormat = DATE_FORMAT,
    timeFormat = TIME_FORMAT_12,
    error,
    fullWidth,
    onFocus,
    onBlur,
    onChange,
    onCalendarClick,
    ...props
  }: DateInputProps,
  ref: Ref<HTMLDivElement>,
) {
  const [inputText, setInputText] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const dateTimeFormat = `${dateFormat}, ${timeFormat}`;

  const now = useMemo(() => {
    return moment();
  }, []);

  const nowText = useMemo(() => {
    return now.format(dateFormat);
  }, [now, dateFormat]);

  const valueText = useMemo(() => {
    if (!value) {
      return "";
    } else if (hasTime) {
      return value.format(dateTimeFormat);
    } else {
      return value.format(dateFormat);
    }
  }, [value, hasTime, dateFormat, dateTimeFormat]);

  const mixedTimeFormats = useMemo(
    () => [
      dateFormat,
      dateTimeFormat,
      `${dateFormat}, ${TIME_FORMAT_12}`,
      `${dateFormat}, ${TIME_FORMAT_24}`,
    ],
    [dateFormat, dateTimeFormat],
  );

  const handleFocus = useCallback(
    (event: FocusEvent<HTMLInputElement>) => {
      setIsFocused(true);
      setInputText(valueText);
      onFocus?.(event);
    },
    [valueText, onFocus],
  );

  const handleBlur = useCallback(
    (event: FocusEvent<HTMLInputElement>) => {
      setIsFocused(false);
      onBlur?.(event);
    },
    [onBlur],
  );

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const newText = event.target.value;
      setInputText(newText);

      const formats = hasTime ? mixedTimeFormats : [dateFormat];
      const newValue = moment(newText, formats);

      if (newValue.isValid()) {
        onChange?.(newValue);
      } else {
        onChange?.(undefined);
      }
    },
    [hasTime, dateFormat, mixedTimeFormats, onChange],
  );

  return (
    <Input
      {...props}
      ref={ref}
      value={isFocused ? inputText : valueText}
      placeholder={nowText}
      error={error}
      fullWidth={fullWidth}
      rightIcon={hasCalendar ? "calendar" : undefined}
      rightIconTooltip={t`Show calendar`}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onChange={handleChange}
      onRightIconClick={onCalendarClick}
    />
  );
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DateInput;
