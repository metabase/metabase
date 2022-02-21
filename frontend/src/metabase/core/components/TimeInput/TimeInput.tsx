import React, { forwardRef, Ref } from "react";
import {
  InputClearButton,
  InputClearIcon,
  InputDivider,
  InputField,
  InputRoot,
} from "./TimeInput.styled";

export interface TimeInputProps {
  hours?: number;
  minutes?: number;
  onChangeHours?: (hours?: number) => void;
  onChangeMinutes?: (minutes?: number) => void;
  onClear?: () => void;
}

const TimeInput = forwardRef(function TimeInput(
  { hours, minutes, onChangeHours, onChangeMinutes, onClear }: TimeInputProps,
  ref: Ref<HTMLDivElement>,
): JSX.Element {
  return (
    <InputRoot ref={ref}>
      <InputField value={hours} fullWidth onChange={onChangeHours} />
      <InputDivider>:</InputDivider>
      <InputField value={minutes} fullWidth onChange={onChangeMinutes} />
      {onClear && (
        <InputClearButton>
          <InputClearIcon name="close" />
        </InputClearButton>
      )}
    </InputRoot>
  );
});

export default TimeInput;
