import { useCallback } from "react";
import moment, { Moment } from "moment";

export interface BaseTimeInputProps {
  value: Moment;
  is24HourMode?: boolean;
  autoFocus?: boolean;
  onChange?: (value: Moment) => void;
  onClear?: (value: Moment) => void;
}

function useTimeInput({
  value,
  is24HourMode,
  onChange,
  onClear,
}: BaseTimeInputProps) {
  const hoursText = value.format(is24HourMode ? "HH" : "hh");
  const minutesText = value.format("mm");
  const isAm = value.hours() < 12;
  const isPm = !isAm;
  const amText = moment.localeData().meridiem(0, 0, false);
  const pmText = moment.localeData().meridiem(12, 0, false);

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

  const handleAM = useCallback(() => {
    if (isPm) {
      const newValue = value.clone();
      newValue.hours(newValue.hours() - 12);
      onChange?.(newValue);
    }
  }, [value, isPm, onChange]);

  const handlePM = useCallback(() => {
    if (isAm) {
      const newValue = value.clone();
      newValue.hours(newValue.hours() + 12);
      onChange?.(newValue);
    }
  }, [value, isAm, onChange]);

  const handleClear = useCallback(() => {
    const newValue = value.clone();
    newValue.hours(0);
    newValue.minutes(0);
    onClear?.(newValue);
  }, [value, onClear]);

  return {
    isAm,
    isPm,
    hoursText,
    minutesText,
    amText,
    pmText,
    handleHoursChange,
    handleMinutesChange,
    handleAM,
    handlePM,
    handleClear,
  };
}

export default useTimeInput;
