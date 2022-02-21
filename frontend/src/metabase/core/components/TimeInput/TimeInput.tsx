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
  { value, onChange }: TimeInputProps,
  ref: Ref<HTMLDivElement>,
): JSX.Element {
  const hoursText = formatTime(value?.hours());
  const minutesText = formatTime(value?.minutes());

  const handleHoursChange = useCallback(
    (hours?: number) => {
      const newValue = moment.duration({
        hours: hours ? hours % 24 : 0,
        minutes: value ? value.minutes() : 0,
      });
      onChange?.(newValue);
    },
    [value, onChange],
  );

  const handleMinutesChange = useCallback(
    (minutes?: number) => {
      const newValue = moment.duration({
        hours: value ? value.hours() : 0,
        minutes: minutes ? minutes % 60 : 0,
      });
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
        value={hoursText}
        placeholder="00"
        fullWidth
        onChange={handleHoursChange}
      />
      <InputDivider>:</InputDivider>
      <InputField
        value={minutesText}
        placeholder="00"
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

const formatTime = (value?: number) => {
  if (value != null) {
    return value < 10 ? `0${value}` : `${value}`;
  } else {
    return "";
  }
};

export default TimeInput;
