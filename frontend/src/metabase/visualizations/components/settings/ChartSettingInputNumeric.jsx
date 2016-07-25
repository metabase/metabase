import React, { Component, PropTypes } from "react";

const ChartSettingInputNumeric = ({ value, onChange }) =>
    <input
        className="input block full"
        value={value == undefined ? "" : String(value)}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => {
            let num = parseFloat(e.target.value);
            onChange(isNaN(num) ? undefined : num);
        }}
    />

export default ChartSettingInputNumeric;
