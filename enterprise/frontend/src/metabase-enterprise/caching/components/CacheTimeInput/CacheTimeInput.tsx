import React, { FocusEvent, useCallback } from "react";
import { t } from "ttag";
import {
  TimeInputMessage,
  TimeInputRoot,
  TimeInput,
} from "./CacheTimeInput.styled";

export interface CacheTimeInputProps {
  value?: number;
  message?: string;
  error?: boolean;
  inputId?: string;
  onChange?: (value?: number) => void;
  onBlur?: (event: FocusEvent<HTMLInputElement>) => void;
}

const CacheTimeInput = ({
  value,
  message,
  error,
  inputId,
  onChange,
  onBlur,
}: CacheTimeInputProps): JSX.Element => {
  const handleBlur = useCallback(
    (event: FocusEvent<HTMLInputElement>) => {
      onChange?.(value !== 0 ? value : undefined);
      onBlur?.(event);
    },
    [value, onChange, onBlur],
  );

  return (
    <TimeInputRoot>
      {message && <TimeInputMessage error={error}>{message}</TimeInputMessage>}
      <TimeInput
        id={inputId}
        value={value}
        error={error}
        placeholder="24"
        onChange={onChange}
        onBlur={handleBlur}
      />
      <TimeInputMessage error={error}>{t`hours`}</TimeInputMessage>
    </TimeInputRoot>
  );
};

export default CacheTimeInput;
