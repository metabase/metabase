import React from "react";
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
  onChange?: (value?: number) => void;
}

const CacheTimeInput = ({
  value,
  message,
  error,
  onChange,
}: CacheTimeInputProps): JSX.Element => {
  return (
    <TimeInputRoot>
      {message && <TimeInputMessage error={error}>{message}</TimeInputMessage>}
      <TimeInput
        value={value}
        error={error}
        placeholder="24"
        onChange={onChange}
      />
      <TimeInputMessage error={error}>{t`hours`}</TimeInputMessage>
    </TimeInputRoot>
  );
};

export default CacheTimeInput;
