/* eslint-disable react/prop-types */
import React from "react";
import { t } from "ttag";
import { Toggle } from "metabase/core/components/Toggle";
import { Tooltip } from "metabase/core/components/Tooltip";

const SettingToggle = ({
  disabled,
  hideLabel,
  id,
  setting,
  tooltip,
  onChange,
}) => {
  const value = setting.value == null ? setting.default : setting.value;
  const on = value === true || value === "true";
  return (
    <div className="flex align-center pt1">
      <Tooltip tooltip={tooltip} isEnabled={!!tooltip}>
        <Toggle
          id={id}
          value={on}
          onChange={!disabled ? () => onChange(!on) : null}
          disabled={disabled}
        />
      </Tooltip>
      {!hideLabel && (
        <span className="text-bold mx1">{on ? t`Enabled` : t`Disabled`}</span>
      )}
    </div>
  );
};

export default SettingToggle;
