import type { ChangeEventHandler } from "react";
import { useState } from "react";
import { t } from "ttag";

import Select from "metabase/core/components/Select";
import Toggle from "metabase/core/components/Toggle";

import {
  SessionTimeoutInput,
  SessionTimeoutInputContainer,
  SessionTimeoutSettingRoot,
  SessionTimeoutSettingContainer,
  ErrorMessage,
} from "./SessionTimeoutSetting.styled";

const UNITS = [
  { value: "minutes", name: t`minutes` },
  { value: "hours", name: t`hours` },
];

const DEFAULT_VALUE = { amount: 30, unit: UNITS[0].value };

type TimeoutValue = { amount: number; unit: string };
interface SessionTimeoutSettingProps {
  setting: {
    key: string;
    value: TimeoutValue | null;
    default: string;
  };

  onChange: (value: TimeoutValue | null) => void;
}

// This should mirror the BE validation of the session-timeout setting.
const validate = (value: TimeoutValue) => {
  if (value.amount <= 0) {
    return t`Timeout must be greater than 0`;
  }
  // We need to limit the duration from being too large because
  // the year of the expires date must be 4 digits (#25253)
  const unitsPerDay = { hours: 24, minutes: 24 * 60 }[value.unit] as number;
  const days = value.amount / unitsPerDay;
  const daysIn100Years = 365.25 * 100;
  if (days >= daysIn100Years) {
    return t`Timeout must be less than 100 years`;
  }
  return null;
};

const SessionTimeoutSetting = ({
  setting,
  onChange,
}: SessionTimeoutSettingProps) => {
  const [value, setValue] = useState(setting.value ?? DEFAULT_VALUE);

  const handleValueChange = (newValue: Partial<TimeoutValue>) => {
    setValue(prev => ({ ...prev, ...newValue }));
  };

  const error = validate(value);

  const handleCommitSettings = (value: TimeoutValue | null) => {
    !error && onChange(value);
  };

  const handleBlurChange: ChangeEventHandler<HTMLInputElement> = () => {
    handleCommitSettings(value);
  };

  const handleUnitChange: ChangeEventHandler<HTMLInputElement> = e => {
    const unit = e.target.value;
    handleValueChange({ unit });
    handleCommitSettings({ ...value, unit });
  };

  const handleToggle = (isEnabled: boolean) => {
    onChange(isEnabled ? DEFAULT_VALUE : null);
    setValue(DEFAULT_VALUE);
  };

  const isEnabled = setting.value != null;

  return (
    <SessionTimeoutSettingRoot>
      <SessionTimeoutSettingContainer>
        <Toggle value={setting.value != null} onChange={handleToggle} />

        {isEnabled && (
          <SessionTimeoutInputContainer>
            <SessionTimeoutInput
              type="number"
              data-testid="session-timeout-input"
              placeholder=""
              value={value?.amount.toString()}
              onChange={e =>
                handleValueChange({ amount: parseInt(e.target.value, 10) })
              }
              onBlur={handleBlurChange}
            />
            <Select
              value={value?.unit.toString()}
              options={UNITS}
              onChange={handleUnitChange}
            />
          </SessionTimeoutInputContainer>
        )}
      </SessionTimeoutSettingContainer>
      {error && <ErrorMessage>{error}</ErrorMessage>}
    </SessionTimeoutSettingRoot>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default SessionTimeoutSetting;
