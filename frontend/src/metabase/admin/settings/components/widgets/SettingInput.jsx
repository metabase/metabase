import React from "react";

import Input from "metabase/components/Input.jsx";
import cx from "classnames";

const SettingInput = ({ setting, updateSetting, disabled, autoFocus, errorMessage, fireOnChange, type = "text" }) =>
    <Input
        className={cx(" AdminInput bordered rounded h3", {
            "SettingsInput": type !== "password",
            "SettingsPassword": type === "password",
            "border-error bg-error-input": errorMessage
        })}
        type={type}
        value={setting.value || ""}
        placeholder={setting.placeholder}
        onChange={fireOnChange ? (e) => updateSetting(e.target.value) : null }
        onBlurChange={!fireOnChange ? (e) => updateSetting(e.target.value) : null }
        autoFocus={autoFocus}
    />

export default SettingInput;
