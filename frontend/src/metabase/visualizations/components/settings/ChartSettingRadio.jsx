import React, { Component } from "react";
import PropTypes from "prop-types";

import Radio from "metabase/components/Radio.jsx";

const ChartSettingRadio = ({ value, onChange, options = [], className }) =>
    <Radio
        className={className}
        value={value}
        onChange={onChange}
        options={options}
        isVertical
    />

export default ChartSettingRadio;
