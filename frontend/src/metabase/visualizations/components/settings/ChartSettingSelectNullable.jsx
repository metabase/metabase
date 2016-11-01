import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon.jsx";

import ChartSettingSelect from "./ChartSettingSelect.jsx";

const ChartSettingSelectNullable = (props) =>
    <div className="flex align-center">
        <ChartSettingSelect
            {...props}
            placeholder="None"
        />
        { props.value != null &&
            <Icon className="p1 cursor-pointer" name="close" size={12} onClick={() => props.onChange(null)} />
        }
    </div>

export default ChartSettingSelectNullable;
