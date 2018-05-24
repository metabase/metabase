import React from "react";

import Select from "metabase/components/Select.jsx";
import _ from "underscore";

const SettingSelect = ({ setting, onChange, disabled }) => (
  <Select
    className="full-width"
    placeholder={setting.placeholder}
    value={
      _.findWhere(setting.options, { value: setting.value }) || setting.value
    }
    options={setting.options}
    onChange={onChange}
    optionNameFn={option => (typeof option === "object" ? option.name : option)}
    optionValueFn={option =>
      typeof option === "object" ? option.value : option
    }
  />
);

export default SettingSelect;
