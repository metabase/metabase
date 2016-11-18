import React from "react";

import DurationPicker from "metabase/components/DurationPicker";
import cx from "classnames";

const SettingDuration = ({setting, updateSetting, errorMessage}) =>
    <DurationPicker
        inputClass={cx(" AdminInput bordered rounded h3", {
            "border-error bg-error-input": errorMessage
        })}
        selectClass={cx(" AdminInput bordered rounded h3", {
            "border-error bg-error-input": errorMessage
        })}
        selectStyle={{marginLeft: "10px"}}
        valueInSeconds={parseInt(setting.value)}
        onChange={(value) => updateSetting((value.valueInSeconds || 0).toString())}
    />

export default SettingDuration;
