import React from "react";

import Select from "metabase/components/Select.jsx";
import _ from "underscore";

const SettingSelect = ({ setting, updateSetting, disabled }) =>
    <Select
        className="full-width"
        placeholder={setting.placeholder}
        value={_.findWhere(setting.options, { value: setting.value }) || setting.value}
        options={setting.options}
        onChange={updateSetting}
        optionNameFn={option => typeof option === "object" ? option.name : option }
        optionValueFn={option => typeof option === "object" ? option.value : option }
    />

export default SettingSelect;
