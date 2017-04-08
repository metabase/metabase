import React, { Component } from "react";
import PropTypes from "prop-types";

const ChartSettingInput = ({ value, onChange }) =>
    <input
        className="input block full"
        value={value}
        onChange={(e) => onChange(e.target.value)}
    />

export default ChartSettingInput;
