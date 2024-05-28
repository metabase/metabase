import type { Moment } from "moment-timezone"; // eslint-disable-line no-restricted-imports -- deprecated usage
import moment from "moment-timezone"; // eslint-disable-line no-restricted-imports -- deprecated usage
import type { Ref } from "react";
import { forwardRef, useCallback } from "react";
import { t } from "ttag";

import Tooltip from "metabase/core/components/Tooltip";

import {
  InputClearButton,
  InputClearIcon,
  InputDivider,
  InputField,
  InputMeridiemButton,
  InputMeridiemContainer,
  InputRoot,
} from "./TimeInput.styled";

const TIME_FORMAT_12 = "h:mm A";

export interface TimeInputProps {
  value: Moment;
  timeFormat?: string;
  autoFocus?: boolean;
  hasClearButton?: boolean;
  onChange?: (value: Moment) => void;
  onClear?: (value: Moment) => void;
}

/**
 * @deprecated: use TimeInput from "metabase/ui"
 */
const TimeInput = forwardRef(function TimeInput(
  {
    value,
    timeFormat = TIME_FORMAT_12,
    autoFocus,
    hasClearButton = true,
    onChange,
    onClear,
  }: TimeInputProps,
  ref: Ref<HTMLDivElement>,
): JSX.Element {
  const is24HourMode = timeFormat === "HH:mm";
  const hoursText = value.format(is24HourMode ? "HH" : "hh");
  const minutesText = value.format("mm");
  const isAm = value.hours() < 12;
  const isPm = !isAm;
  const amText = moment.localeData().meridiem(0, 0, false);
  const pmText = moment.localeData().meridiem(12, 0, false);

  const handleHoursChange = useCallback(
    (hours: number = 0) => {
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
    (minutes: number = 0) => {
      const newValue = value.clone();
      newValue.minutes(minutes % 60);
      onChange?.(newValue);
    },
    [value, onChange],
  );

  const handleAmClick = useCallback(() => {
    if (isPm) {
      const newValue = value.clone();
      newValue.hours(newValue.hours() - 12);
      onChange?.(newValue);
    }
  }, [value, isPm, onChange]);

  const handlePmClick = useCallback(() => {
    if (isAm) {
      const newValue = value.clone();
      newValue.hours(newValue.hours() + 12);
      onChange?.(newValue);
    }
  }, [value, isAm, onChange]);

  const handleClearClick = useCallback(() => {
    const newValue = value.clone();
    newValue.hours(0);
    newValue.minutes(0);
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
      {!is24HourMode && (
        <InputMeridiemContainer>
          <InputMeridiemButton isSelected={isAm} onClick={handleAmClick}>
            {amText}
          </InputMeridiemButton>
          <InputMeridiemButton isSelected={isPm} onClick={handlePmClick}>
            {pmText}
          </InputMeridiemButton>
        </InputMeridiemContainer>
      )}
      {hasClearButton && (
        <Tooltip tooltip={t`Remove time`}>
          <InputClearButton
            aria-label={t`Remove time`}
            onClick={handleClearClick}
          >
            <InputClearIcon name="close" />
          </InputClearButton>
        </Tooltip>
      )}
    </InputRoot>
  );
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default TimeInput;
