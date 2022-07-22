import React, { forwardRef, Ref } from "react";
import { t } from "ttag";
import { Moment } from "moment";
import Tooltip from "metabase/components/Tooltip";

import useTimeInput, { BaseTimeInputProps } from "./useTimeInput";
import CompactTimeInput from "./CompactTimeInput";

import {
  InputClearButton,
  InputClearIcon,
  InputDivider,
  InputField,
  InputMeridiemButton,
  InputMeridiemContainer,
  InputRoot,
} from "./TimeInput.styled";

export interface TimeInputProps extends BaseTimeInputProps {
  hasClearButton?: boolean;
  onClear?: (value: Moment) => void;
}

const TimeInput = forwardRef(function TimeInput(
  {
    value,
    is24HourMode,
    autoFocus,
    hasClearButton = true,
    onChange,
    onClear,
  }: TimeInputProps,
  ref: Ref<HTMLDivElement>,
): JSX.Element {
  const {
    isAm,
    isPm,
    hoursText,
    minutesText,
    amText,
    pmText,
    handleHoursChange,
    handleMinutesChange,
    handleAM: handleAmClick,
    handlePM: handlePmClick,
    handleClear: handleClearClick,
  } = useTimeInput({ value, is24HourMode, onChange, onClear });

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

export default Object.assign(TimeInput, {
  Compact: CompactTimeInput,
});
