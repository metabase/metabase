import React, { ChangeEvent, FocusEvent, useCallback, useState } from "react";
import moment, { Moment } from "moment";
import Input from "metabase/core/components/Input";

const DATE_FORMAT = "MM/DD/YYYY";

export interface DateInputProps {
  value?: Moment | null;
  onChange?: (value: Moment | null) => void;
}

const DateInput = ({ value, onChange }: DateInputProps): JSX.Element => {
  const [text, setText] = useState(value?.format(DATE_FORMAT));

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const text = event.target.value;
      const date = moment(text, DATE_FORMAT);
      setText(text);

      if (date.isValid()) {
        onChange && onChange(date);
      } else {
        onChange && onChange(null);
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

  return <Input value={text} onChange={handleChange} onBlur={handleBlur} />;
};

export default DateInput;
