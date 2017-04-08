import React, { Component } from "react";
import PropTypes from "prop-types";

import Select from "metabase/components/Select.jsx";
import _ from "underscore";

const YEARS = _.range(new Date().getFullYear(), 1900, -1);

const YearPicker = ({ value, onChange }) =>
    <Select
        className="borderless"
        value={value}
        options={YEARS}
        optionNameFn={(option) => option}
        optionValueFn={(option) => option}
        onChange={onChange}
    />

export default YearPicker;
