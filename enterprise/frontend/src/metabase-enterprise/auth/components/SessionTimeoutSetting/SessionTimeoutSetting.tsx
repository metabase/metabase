import React, { ChangeEventHandler } from "react";
import { t } from "ttag";

import Toggle from "metabase/core/components/Toggle";
import Select from "metabase/core/components/Select";
import InputBlurChange from "metabase/components/InputBlurChange";

import {
  SessionTimeoutInputContainer,
  SessionTimeoutSettingRoot,
} from "./SessionTimeoutSetting.styled";

const UNITS = [
  { value: "minutes", name: t`minutes` },
  { value: "hours", name: t`hours` },
];

const DEFAULT_VALUE = { amount: 30, unit: UNITS[0].value };

const SessionTimeoutSetting = ({ setting, onChange }: any) => {
  const isEnabled = setting.value != null;
  const unit = setting.value?.unit ?? DEFAULT_VALUE.unit;
  const amount = setting.value?.amount ?? DEFAULT_VALUE.amount;

  const handleValueChange: ChangeEventHandler<HTMLInputElement> = e => {
    onChange({
      ...(setting.value ?? DEFAULT_VALUE),
      amount: Number(e.target.value),
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
          <InputBlurChange
            style={{ width: "70px" }}
            className="input mr1 bordered"
            disabled={!isEnabled}
            defaultValue={amount}
            onBlurChange={handleValueChange}
          />
          <Select
            disabled={!isEnabled}
            value={unit}
            options={UNITS}
            onChange={handleUnitChange}
          />
        </SessionTimeoutInputContainer>
      )}
    </SessionTimeoutSettingRoot>
  );
};

export default SessionTimeoutSetting;
