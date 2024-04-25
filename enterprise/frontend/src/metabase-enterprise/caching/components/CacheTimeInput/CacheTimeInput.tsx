import type { FocusEvent } from "react";
import { useCallback } from "react";
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
  const handleChange = useCallback(
    (value?: number) => {
      onChange?.(value !== 0 ? value : undefined);
    },
    [onChange],
  );

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
        onChange={handleChange}
        onBlur={onBlur}
      />
      <TimeInputMessage>{t`hours`}</TimeInputMessage>
    </TimeInputRoot>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default CacheTimeInput;
