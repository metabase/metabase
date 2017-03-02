import React from "react";

import Select from "metabase/components/Select.jsx";

const SettingSelect = ({ setting, updateSetting, disabled }) =>
    <Select
        className="full-width"
        placeholder={setting.placeholder}
        value={setting.value}
        options={setting.options}
        onChange={updateSetting}
        optionNameFn={option => typeof option === "object" ? option.name : option }
        optionValueFn={option => typeof option === "object" ? option.value : option }
    />

export default SettingSelect;
