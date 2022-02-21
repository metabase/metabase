import React, { forwardRef, Ref } from "react";
import NumericInput from "metabase/core/components/NumericInput";
import {
  InputClearButton,
  InputClearIcon,
  InputDivider,
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
      <NumericInput value={hours} onChange={onChangeHours} />
      <InputDivider />
      <NumericInput value={minutes} onChange={onChangeMinutes} />
      {onClear && (
        <InputClearButton>
          <InputClearIcon name="close" />
        </InputClearButton>
      )}
    </InputRoot>
  );
});

export default TimeInput;
