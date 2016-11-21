import React from "react";

import Toggle from "metabase/components/Toggle.jsx";

const SettingToggle = ({ setting, updateSetting, disabled }) => {
    const value = setting.value == null ? setting.default : setting.value;
    const on = value === true || value === "true";
    return (
        <div className="flex align-center pt1">
            <Toggle value={on} onChange={!disabled ? () => updateSetting(!on) : null}/>
            <span className="text-bold mx1">{on ? "Enabled" : "Disabled"}</span>
        </div>
    );
}

export default SettingToggle;
