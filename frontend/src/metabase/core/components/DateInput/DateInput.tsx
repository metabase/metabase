import React, {
  FocusEvent,
  forwardRef,
  Ref,
  useCallback,
  useState,
} from "react";
import moment, { Moment } from "moment";
import { t } from "ttag";
import Input from "metabase/core/components/Input";
import { InputIcon, InputRoot } from "./DateInput.styled";

const DATE_FORMAT = "MM/DD/YYYY";

export interface DateInputProps {
  value?: Moment;
  readOnly?: boolean;
  fullWidth?: boolean;
  onChange?: (value: Moment | undefined) => void;
}

const DateInput = forwardRef(function DateInput(
  { value, readOnly, fullWidth, onChange }: DateInputProps,
  ref: Ref<HTMLDivElement>,
) {
  const [text, setText] = useState(value?.format(DATE_FORMAT));
  const [isOpened, setIsOpened] = useState(false);

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
    <InputRoot ref={ref} readOnly={readOnly} fullWidth={fullWidth}>
      <Input
        value={text}
        readOnly={readOnly}
        fullWidth={fullWidth}
        borderless
        onBlur={handleBlur}
      />
      <InputIcon
        name="calendar"
        tooltip={isOpened ? t`Hide calendar` : t`Show calendar`}
      />
    </InputRoot>
  );
});

export default DateInput;
