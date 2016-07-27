import React, { Component, PropTypes } from "react";

import Select from "metabase/components/Select.jsx";

import _ from "underscore";

const ChartSettingSelect = ({ value, onChange, options = [], isInitiallyOpen }) =>
    <Select
        className="block flex-full"
        value={_.findWhere(options, { value })}
        options={options}
        optionNameFn={(o) => o.name}
        optionValueFn={(o) => o.value}
        onChange={onChange}
        isInitiallyOpen={isInitiallyOpen}
    />

export default ChartSettingSelect;
