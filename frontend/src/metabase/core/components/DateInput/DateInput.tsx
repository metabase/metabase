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
import { getDateStyleFromSettings } from "metabase/lib/time";
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
  dateFormat?: string;
  onChange?: (value: Moment | undefined) => void;
}

const DateInput = forwardRef(function DateInput(
  {
    value,
    inputRef,
    placeholder,
    error,
    fullWidth,
    dateFormat = getDateStyleFromSettings() || "MM/DD/YYYY",
    onFocus,
    onBlur,
    onChange,
    ...props
  }: DateInputProps,
  ref: Ref<HTMLDivElement>,
) {
  const now = useMemo(() => moment(), []);
  const nowText = useMemo(() => now.format(dateFormat), [now, dateFormat]);
  const valueText = useMemo(() => value?.format(dateFormat) || "", [
    value,
    dateFormat,
  ]);
  const [inputText, setInputText] = useState(valueText);
  const [isFocused, setIsFocused] = useState(false);

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
      const newValue = moment(newText, dateFormat);
      setInputText(newText);

      if (newValue.isValid()) {
        onChange?.(newValue);
      } else {
        onChange?.(undefined);
      }
    },
    [dateFormat, onChange],
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
