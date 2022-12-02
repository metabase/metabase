import React, { useCallback, useState } from "react";
import { t } from "ttag";
import Select, { SelectChangeEvent } from "metabase/core/components/Select";
import CacheTimeInput from "../CacheTimeInput";
import { TimeInputRoot } from "./DatabaseCacheTimeInput.styled";

const CACHE_OPTIONS = [
  { name: t`Use instance default (TTL)`, value: false },
  { name: t`Custom`, value: true },
];

const DEFAULT_CACHE_TIME = 24;

export interface DatabaseCacheTimeInputProps {
  value?: number;
  error?: boolean;
  onChange?: (value?: number) => void;
}

const DatabaseCacheTimeInput = ({
  value,
  error,
  onChange,
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
        <CacheTimeInput value={value} error={error} onChange={onChange} />
      )}
    </TimeInputRoot>
  );
};

export default DatabaseCacheTimeInput;
