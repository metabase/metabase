/* eslint-disable react/prop-types */
import React from "react";
import { t } from "ttag";

import Toggle from "metabase/components/Toggle";

const SettingToggle = ({ setting, onChange, disabled }) => {
  const value = setting.value == null ? setting.default : setting.value;
  const on = value === true || value === "true";
  return (
    <div className="flex align-center pt1">
      <Toggle value={on} onChange={!disabled ? () => onChange(!on) : null} />
      <span className="text-bold mx1">{on ? t`Enabled` : t`Disabled`}</span>
    </div>
  );
};

export default SettingToggle;
