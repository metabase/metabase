/* eslint-disable react/prop-types */
import React from "react";
import _ from "underscore";

import Select from "metabase/components/Select";

const YEARS = _.range(new Date().getFullYear(), 1900, -1);

const YearPicker = ({ value, onChange }) => (
  <Select
    className="borderless"
    value={value}
    options={YEARS}
    optionNameFn={option => option}
    optionValueFn={option => option}
    onChange={({ target: { value } }) => onChange(value)}
  />
);

export default YearPicker;
