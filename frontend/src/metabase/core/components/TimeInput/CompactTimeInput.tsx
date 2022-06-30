import React, { forwardRef, Ref, useCallback } from "react";
import { t } from "ttag";

import { SegmentedControl } from "metabase/components/SegmentedControl";

import useTimeInput, { BaseTimeInputProps } from "./useTimeInput";
import {
  InputDivider,
  InputRoot,
  InputMeridiemContainer,
} from "./TimeInput.styled";
import { CompactInputContainer, CompactInput } from "./CompactTimeInput.styled";

export type CompactTimeInputProps = BaseTimeInputProps;

const CompactTimeInput = forwardRef(function TimeInput(
  { value, is24HourMode, autoFocus, onChange }: CompactTimeInputProps,
  ref: Ref<HTMLDivElement>,
): JSX.Element {
  const {
    isAm,
    hoursText,
    minutesText,
    amText,
    pmText,
    handleHoursChange,
    handleMinutesChange,
    handleAM,
    handlePM,
  } = useTimeInput({ value, is24HourMode, onChange });

  const onAmPmChange = useCallback(
    value => {
      if (value === "am") {
        handleAM();
      } else {
        handlePM();
      }
    },
    [handleAM, handlePM],
  );

  return (
    <InputRoot ref={ref}>
      <CompactInputContainer>
        <CompactInput
          value={hoursText}
          placeholder="00"
          autoFocus={autoFocus}
          fullWidth
          aria-label={t`Hours`}
          onChange={handleHoursChange}
        />
        <InputDivider>:</InputDivider>
        <CompactInput
          value={minutesText}
          placeholder="00"
          fullWidth
          aria-label={t`Minutes`}
          onChange={handleMinutesChange}
        />
      </CompactInputContainer>
      {!is24HourMode && (
        <InputMeridiemContainer>
          <SegmentedControl
            name="am-pm"
            value={isAm ? "am" : "pm"}
            options={[
              { name: amText, value: "am" },
              { name: pmText, value: "pm" },
            ]}
            variant="fill-all"
            onChange={onAmPmChange}
          />
        </InputMeridiemContainer>
      )}
    </InputRoot>
  );
});

export default CompactTimeInput;
