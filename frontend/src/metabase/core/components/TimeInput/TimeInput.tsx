import React, { forwardRef, Ref, useCallback } from "react";
import { t } from "ttag";
import { Moment } from "moment";
import Tooltip from "metabase/components/Tooltip";
import {
  InputClearButton,
  InputClearIcon,
  InputDivider,
  InputField,
  InputRoot,
} from "./TimeInput.styled";

export interface TimeInputProps {
  value: Moment;
  is24HourMode?: boolean;
  autoFocus?: boolean;
  onChange?: (value: Moment) => void;
  onClear?: (value: Moment) => void;
}

const TimeInput = forwardRef(function TimeInput(
  { value, is24HourMode, autoFocus, onChange, onClear }: TimeInputProps,
  ref: Ref<HTMLDivElement>,
): JSX.Element {
  const isAm = value.hours() < 12;
  const hoursText = value.format(is24HourMode ? "HH" : "hh");
  const minutesText = value.format("mm");

  const handleHoursChange = useCallback(
    (hours = 0) => {
      const newValue = value.clone();
      if (is24HourMode) {
        newValue.hours(hours % 24);
      } else {
        newValue.hours((hours % 12) + (isAm ? 0 : 12));
      }
      onChange?.(newValue);
    },
    [value, isAm, is24HourMode, onChange],
  );

  const handleMinutesChange = useCallback(
    (minutes = 0) => {
      const newValue = value.clone();
      newValue.minutes(minutes % 60);
      onChange?.(newValue);
    },
    [value, onChange],
  );

  const handleClearClick = useCallback(() => {
    const newValue = value.clone();
    value.hours(0);
    value.minutes(0);
    onClear?.(newValue);
  }, [value, onClear]);

  return (
    <InputRoot ref={ref}>
      <InputField
        value={hoursText}
        placeholder="00"
        autoFocus={autoFocus}
        fullWidth
        aria-label={t`Hours`}
        onChange={handleHoursChange}
      />
      <InputDivider>:</InputDivider>
      <InputField
        value={minutesText}
        placeholder="00"
        fullWidth
        aria-label={t`Minutes`}
        onChange={handleMinutesChange}
      />
      <Tooltip tooltip={t`Remove time`}>
        <InputClearButton
          aria-label={t`Remove time`}
          onClick={handleClearClick}
        >
          <InputClearIcon name="close" />
        </InputClearButton>
      </Tooltip>
    </InputRoot>
  );
});

export default TimeInput;
