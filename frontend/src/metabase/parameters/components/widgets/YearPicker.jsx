import React from "react";

import Select from "metabase/components/Select";
import _ from "underscore";

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
