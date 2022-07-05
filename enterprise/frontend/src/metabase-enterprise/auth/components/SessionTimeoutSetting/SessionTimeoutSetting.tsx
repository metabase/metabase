import React, { ChangeEventHandler } from "react";
import { t } from "ttag";

import Toggle from "metabase/core/components/Toggle";
import Select from "metabase/core/components/Select";

import {
  SessionTimeoutInput,
  SessionTimeoutInputContainer,
  SessionTimeoutSettingRoot,
} from "./SessionTimeoutSetting.styled";

const UNITS = [
  { value: "minutes", name: t`minutes` },
  { value: "hours", name: t`hours` },
];

const DEFAULT_VALUE = { amount: 30, unit: UNITS[0].value };

type TimeoutValue = { amount: number; unit: string } | null;
interface SessionTimeoutSettingProps {
  setting: {
    key: string;
    value: TimeoutValue;
    default: string;
  };

  onChange: (value: TimeoutValue) => void;
}

const SessionTimeoutSetting = ({
  setting,
  onChange,
}: SessionTimeoutSettingProps) => {
  const isEnabled = setting.value != null;
  const unit = setting.value?.unit ?? DEFAULT_VALUE.unit;
  const amount = setting.value?.amount ?? DEFAULT_VALUE.amount;

  const handleValueChange: ChangeEventHandler<HTMLInputElement> = e => {
    onChange({
      ...(setting.value ?? DEFAULT_VALUE),
      amount: parseInt(e.target.value, 10),
    });
  };

  const handleUnitChange: ChangeEventHandler<HTMLInputElement> = e => {
    onChange({ ...(setting.value ?? DEFAULT_VALUE), unit: e.target.value });
  };

  const handleToggle = (isEnabled: boolean) => {
    onChange(isEnabled ? DEFAULT_VALUE : null);
  };

  return (
    <SessionTimeoutSettingRoot>
      <Toggle value={setting.value != null} onChange={handleToggle} />

      {isEnabled && (
        <SessionTimeoutInputContainer>
          <SessionTimeoutInput
            className="input"
            defaultValue={amount.toString()}
            onBlurChange={handleValueChange}
          />
          <Select value={unit} options={UNITS} onChange={handleUnitChange} />
        </SessionTimeoutInputContainer>
      )}
    </SessionTimeoutSettingRoot>
  );
};

export default SessionTimeoutSetting;
