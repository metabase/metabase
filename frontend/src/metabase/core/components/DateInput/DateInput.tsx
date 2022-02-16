import React, {
  ChangeEvent,
  FocusEvent,
  forwardRef,
  HTMLAttributes,
  Ref,
  useCallback,
  useState,
} from "react";
import moment, { Moment } from "moment";
import Input from "metabase/core/components/Input";
import { InputIcon, InputRoot } from "./DateInput.styled";

const DATE_FORMAT = "MM/DD/YYYY";

export type DateInputAttributes = Omit<
  HTMLAttributes<HTMLDivElement>,
  "onChange" | "onFocus" | "onBlur"
>;

export interface DateInputProps extends DateInputAttributes {
  value?: Moment;
  readOnly?: boolean;
  fullWidth?: boolean;
  onChange?: (value: Moment | undefined) => void;
  onFocus?: (event: FocusEvent<HTMLInputElement>) => void;
  onBlur?: (event: FocusEvent<HTMLInputElement>) => void;
}

const DateInput = forwardRef(function DateInput(
  {
    value,
    readOnly,
    fullWidth,
    onChange,
    onFocus,
    onBlur,
    ...props
  }: DateInputProps,
  ref: Ref<HTMLDivElement>,
) {
  const [text, setText] = useState(value?.format(DATE_FORMAT));

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const newText = event.target.value;
      const newValue = moment(newText, DATE_FORMAT);
      setText(newText);

      if (newValue.isValid()) {
        onChange?.(newValue);
      } else if (!newText) {
        onChange?.(undefined);
      }
    },
    [onChange],
  );

  return (
    <InputRoot ref={ref} readOnly={readOnly} fullWidth={fullWidth} {...props}>
      <Input
        value={text}
        readOnly={readOnly}
        fullWidth={fullWidth}
        borderless
        onChange={handleChange}
        onFocus={onFocus}
        onBlur={onBlur}
      />
      <InputIcon name="calendar" />
    </InputRoot>
  );
});

export default DateInput;
