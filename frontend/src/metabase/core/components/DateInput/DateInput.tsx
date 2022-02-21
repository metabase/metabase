import React, {
  ChangeEvent,
  FocusEvent,
  forwardRef,
  InputHTMLAttributes,
  Ref,
  useCallback,
  useMemo,
  useState,
} from "react";
import moment, { Moment } from "moment";
import { t } from "ttag";
import {
  getDateStyleFromSettings,
  getTimeStyleFromSettings,
  hasTime,
} from "metabase/lib/time";
import Input from "metabase/core/components/Input";

export type DateInputAttributes = Omit<
  InputHTMLAttributes<HTMLDivElement>,
  "value" | "onChange"
>;

export interface DateInputProps extends DateInputAttributes {
  value?: Moment;
  inputRef?: Ref<HTMLInputElement>;
  error?: boolean;
  fullWidth?: boolean;
  onChange?: (value?: Moment) => void;
}

const DateInput = forwardRef(function DateInput(
  {
    value,
    inputRef,
    placeholder,
    error,
    fullWidth,
    onFocus,
    onBlur,
    onChange,
    ...props
  }: DateInputProps,
  ref: Ref<HTMLDivElement>,
) {
  const [inputText, setInputText] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const dateFormat = getDateStyleFromSettings() || "MM/DD/YYYY";
  const timeFormat = getTimeStyleFromSettings() || "HH:mm";
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
    } else if (hasTime(value)) {
      return value.format(dateTimeFormat);
    } else {
      return value.format(dateFormat);
    }
  }, [value, dateFormat, dateTimeFormat]);

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
      const newValue = moment(newText, [dateTimeFormat, dateFormat]);
      setInputText(newText);

      if (newValue.isValid()) {
        onChange?.(newValue);
        console.log(newValue);
      } else {
        onChange?.(undefined);
      }
    },
    [dateFormat, dateTimeFormat, onChange],
  );

  return (
    <Input
      {...props}
      ref={ref}
      value={isFocused ? inputText : valueText}
      placeholder={nowText}
      error={error}
      fullWidth={fullWidth}
      rightIcon="calendar"
      rightIconTooltip={t`Show calendar`}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onChange={handleChange}
    />
  );
});

export default DateInput;
