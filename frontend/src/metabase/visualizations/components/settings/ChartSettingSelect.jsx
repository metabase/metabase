import React from "react";

import Select from "metabase/components/Select.jsx";

import _ from "underscore";
import cx from "classnames";

const ChartSettingSelect = ({ value, onChange, options = [], isInitiallyOpen, className, placeholder, placeholderNoOptions }) =>
    <Select
        className={cx(className, "block flex-full", { disabled: options.length === 0 || (options.length === 1 && options[0].value === value) })}
        value={_.findWhere(options, { value })}
        options={options}
        optionNameFn={(o) => o.name}
        optionValueFn={(o) => o.value}
        onChange={onChange}
        placeholder={options.length === 0 ? placeholderNoOptions : placeholder}
        isInitiallyOpen={isInitiallyOpen}
    />

export default ChartSettingSelect;
