import React, { FocusEvent } from "react";
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
  return (
    <TimeInputRoot>
      {message && <TimeInputMessage error={error}>{message}</TimeInputMessage>}
      <TimeInput
        id={inputId}
        value={value}
        error={error}
        placeholder="24"
        onChange={onChange}
        onBlur={onBlur}
      />
      <TimeInputMessage error={error}>{t`hours`}</TimeInputMessage>
    </TimeInputRoot>
  );
};

export default CacheTimeInput;
