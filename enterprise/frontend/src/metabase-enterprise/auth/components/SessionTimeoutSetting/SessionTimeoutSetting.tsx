import React, { ChangeEventHandler, useState } from "react";
import { t } from "ttag";

import Toggle from "metabase/core/components/Toggle";
import Select from "metabase/core/components/Select";

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

const validate = (
  setting: SessionTimeoutSettingProps["setting"],
  value: TimeoutValue,
) =>
  setting.value == null || value.amount > 0
    ? null
    : t`Timeout must be greater than 0`;

const SessionTimeoutSetting = ({
  setting,
  onChange,
}: SessionTimeoutSettingProps) => {
  const [value, setValue] = useState(setting.value ?? DEFAULT_VALUE);

  const handleValueChange = (newValue: Partial<TimeoutValue>) => {
    setValue(prev => ({ ...prev, ...newValue }));
  };

  const error = validate(setting, value);

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
              placeholder=""
              value={value?.amount.toString()}
              onChange={value =>
                handleValueChange({ amount: parseInt(value, 10) })
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

export default SessionTimeoutSetting;
