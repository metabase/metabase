import React, {
  ChangeEvent,
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
  onChange?: (value: Moment | undefined) => void;
}

const DateInput = forwardRef(function DateInput(
  { value, onChange }: DateInputProps,
  ref: Ref<HTMLDivElement>,
) {
  const [text, setText] = useState(value?.format(DATE_FORMAT));

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const text = event.target.value;
      const date = moment(text, DATE_FORMAT);
      setText(text);

      if (date.isValid()) {
        onChange?.(date);
      } else {
        onChange?.(undefined);
      }
    },
    [onChange],
  );

  const handleBlur = useCallback((event: FocusEvent<HTMLInputElement>) => {
    const text = event.target.value;
    const date = moment(text, DATE_FORMAT);

    if (date.isValid()) {
      setText(date.format(DATE_FORMAT));
    } else {
      setText("");
    }
  }, []);

  return (
    <InputRoot ref={ref}>
      <Input
        value={text}
        fullWidth
        onChange={handleChange}
        onBlur={handleBlur}
      />
    </InputRoot>
  );
});

export default DateInput;
