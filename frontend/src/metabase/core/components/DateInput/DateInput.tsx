import React, {
  FocusEvent,
  forwardRef,
  Ref,
  useCallback,
  useState,
} from "react";
import moment, { Moment } from "moment";
import Input from "metabase/core/components/Input";
import { InputRoot } from "metabase/core/components/DateInput/DateInput.styled";

const DATE_FORMAT = "MM/DD/YYYY";

export interface DateInputProps {
  value?: Moment;
  fullWidth?: boolean;
  onChange?: (value: Moment | undefined) => void;
}

const DateInput = forwardRef(function DateInput(
  { value, fullWidth, onChange }: DateInputProps,
  ref: Ref<HTMLDivElement>,
) {
  const [text, setText] = useState(value?.format(DATE_FORMAT));

  const handleBlur = useCallback(
    (event: FocusEvent<HTMLInputElement>) => {
      const text = event.target.value;
      const date = moment(text, DATE_FORMAT);

      if (date.isValid()) {
        setText(date.format(DATE_FORMAT));
        onChange?.(date);
      } else {
        setText("");
        onChange?.(undefined);
      }
    },
    [onChange],
  );

  return (
    <InputRoot ref={ref} fullWidth={fullWidth}>
      <Input value={text} fullWidth={fullWidth} onBlur={handleBlur} />
    </InputRoot>
  );
});

export default DateInput;
