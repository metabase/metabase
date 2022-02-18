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
import Input from "metabase/core/components/Input";

const DATE_FORMAT = "MM/DD/YYYY";

export type DateInputAttributes = Omit<
  InputHTMLAttributes<HTMLDivElement>,
  "value" | "onChange"
>;

export interface DateInputProps extends DateInputAttributes {
  inputRef?: Ref<HTMLInputElement>;
  value?: Moment;
  error?: boolean;
  fullWidth?: boolean;
  onChange?: (value: Moment | undefined) => void;
}

const DateInput = forwardRef(function DateInput(
  {
    className,
    style,
    inputRef,
    value,
    placeholder,
    readOnly,
    disabled,
    error,
    fullWidth,
    onFocus,
    onBlur,
    onChange,
    ...props
  }: DateInputProps,
  ref: Ref<HTMLDivElement>,
) {
  const now = useMemo(() => moment(), []);
  const nowText = useMemo(() => now.format(DATE_FORMAT), [now]);
  const valueText = useMemo(() => value?.format(DATE_FORMAT) ?? "", [value]);
  const [inputText, setInputText] = useState(valueText);
  const [isFocused, setIsFocused] = useState(false);

  const handleInputFocus = useCallback(
    (event: FocusEvent<HTMLInputElement>) => {
      setIsFocused(true);
      setInputText(valueText);
      onFocus?.(event);
    },
    [valueText, onFocus],
  );

  const handleInputBlur = useCallback(
    (event: FocusEvent<HTMLInputElement>) => {
      setIsFocused(false);
      onBlur?.(event);
    },
    [onBlur],
  );

  const handleInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const newText = event.target.value;
      const newValue = moment(newText, DATE_FORMAT);
      setInputText(newText);

      if (newValue.isValid()) {
        onChange?.(newValue);
      } else {
        onChange?.(undefined);
      }
    },
    [onChange],
  );

  return (
    <Input
      {...props}
      ref={ref}
      value={isFocused ? inputText : valueText}
      placeholder={nowText}
      readOnly={readOnly}
      disabled={disabled}
      error={error}
      fullWidth={fullWidth}
      rightIcon="calendar"
      rightIconTooltip={t`Show calendar`}
      onFocus={handleInputFocus}
      onBlur={handleInputBlur}
      onChange={handleInputChange}
    />
  );
});

export default DateInput;
