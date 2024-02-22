import type { FocusEvent } from "react";
import { useCallback, useState } from "react";
import { t } from "ttag";

import type { SelectChangeEvent } from "metabase/core/components/Select";
import Select from "metabase/core/components/Select";

import CacheTimeInput from "../CacheTimeInput";

import { TimeInputRoot } from "./DatabaseCacheTimeInput.styled";

const CACHE_OPTIONS = [
  { name: t`Use instance default (TTL)`, value: false },
  { name: t`Custom`, value: true },
];

const DEFAULT_CACHE_TIME = 24;

export interface DatabaseCacheTimeInputProps {
  id?: string;
  name?: string;
  value?: number;
  error?: boolean;
  onChange?: (value?: number) => void;
  onBlur?: (event: FocusEvent<HTMLInputElement>) => void;
}

const DatabaseCacheTimeInput = ({
  id,
  name,
  value,
  error,
  onChange,
  onBlur,
}: DatabaseCacheTimeInputProps): JSX.Element => {
  const [isCustom, setIsCustom] = useState(value != null);

  const handleChange = useCallback(
    ({ target: { value: isCustom } }: SelectChangeEvent<boolean>) => {
      setIsCustom(isCustom);
      onChange?.(isCustom ? DEFAULT_CACHE_TIME : undefined);
    },
    [onChange],
  );

  return (
    <TimeInputRoot>
      <Select
        value={isCustom}
        options={CACHE_OPTIONS}
        onChange={handleChange}
      />
      {isCustom && (
        <CacheTimeInput
          id={id}
          name={name}
          value={value}
          error={error}
          onChange={onChange}
          onBlur={onBlur}
        />
      )}
    </TimeInputRoot>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DatabaseCacheTimeInput;
