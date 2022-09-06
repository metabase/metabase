/* eslint-disable react/prop-types */
import React from "react";
import { t } from "ttag";
import Toggle from "metabase/core/components/Toggle";
import Tooltip from "metabase/components/Tooltip";

const SettingToggle = ({ setting, onChange, disabled, tooltip }) => {
  const value = setting.value == null ? setting.default : setting.value;
  const on = value === true || value === "true";
  return (
    <div className="flex align-center pt1">
      <Tooltip tooltip={tooltip} isEnabled={!!tooltip}>
        <Toggle value={on} onChange={!disabled ? () => onChange(!on) : null} />
      </Tooltip>
      <span className="text-bold mx1">{on ? t`Enabled` : t`Disabled`}</span>
    </div>
  );
};

export default SettingToggle;
