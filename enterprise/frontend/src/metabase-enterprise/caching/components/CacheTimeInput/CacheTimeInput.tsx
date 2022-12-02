import React, { FocusEvent } from "react";
import { t } from "ttag";
import {
  TimeInputMessage,
  TimeInputRoot,
  TimeInput,
} from "./CacheTimeInput.styled";

export interface CacheTimeInputProps {
  id?: string;
  name?: string;
  value?: number;
  message?: string;
  error?: boolean;
  onChange?: (value?: number) => void;
  onBlur?: (event: FocusEvent<HTMLInputElement>) => void;
}

const CacheTimeInput = ({
  id,
  name,
  value,
  message,
  error,
  onChange,
  onBlur,
}: CacheTimeInputProps): JSX.Element => {
  return (
    <TimeInputRoot>
      {message && <TimeInputMessage>{message}</TimeInputMessage>}
      <TimeInput
        id={id}
        name={name}
        value={value}
        placeholder="24"
        error={error}
        fullWidth
        onChange={onChange}
        onBlur={onBlur}
      />
      <TimeInputMessage>{t`hours`}</TimeInputMessage>
    </TimeInputRoot>
  );
};

export default CacheTimeInput;
