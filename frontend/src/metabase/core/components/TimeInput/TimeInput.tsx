import React, { forwardRef, Ref, useCallback } from "react";
import moment, { Duration } from "moment";
import {
  InputClearButton,
  InputClearIcon,
  InputDivider,
  InputField,
  InputRoot,
} from "./TimeInput.styled";

export interface TimeInputProps {
  value?: Duration;
  onChange?: (value?: Duration) => void;
}

const TimeInput = forwardRef(function TimeInput(
  { value = moment.duration(), onChange }: TimeInputProps,
  ref: Ref<HTMLDivElement>,
): JSX.Element {
  const handleHoursChange = useCallback(
    (hours = 0) => {
      const newValue = moment.duration({ hours, minutes: value.minutes() });
      onChange?.(newValue);
    },
    [value, onChange],
  );

  const handleMinutesChange = useCallback(
    (minutes = 0) => {
      const newValue = moment.duration({ hours: value.hours(), minutes });
      onChange?.(newValue);
    },
    [value, onChange],
  );

  const handleClearClick = useCallback(() => {
    onChange?.(undefined);
  }, [onChange]);

  return (
    <InputRoot ref={ref}>
      <InputField
        value={formatTime(value.hours())}
        fullWidth
        onChange={handleHoursChange}
      />
      <InputDivider>:</InputDivider>
      <InputField
        value={formatTime(value.minutes())}
        fullWidth
        onChange={handleMinutesChange}
      />
      {
        <InputClearButton onClick={handleClearClick}>
          <InputClearIcon name="close" />
        </InputClearButton>
      }
    </InputRoot>
  );
});

const formatTime = (value: number) => {
  return value < 10 ? `0${value}` : `${value}`;
};

export default TimeInput;
