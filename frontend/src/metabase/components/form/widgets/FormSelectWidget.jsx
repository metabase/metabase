import React from "react";

import Select, { Option } from "metabase/components/Select";

const FormSelectWidget = ({ placeholder, options = [], field }) => (
  <Select
    placeholder={placeholder}
    {...field}
    // react-redux expects to be raw value
    onChange={e => field.onChange(e.target.value)}
    buttonProps={{ style: { minWidth: 200 } }}
  >
    {options.map(({ name, value }) => (
      <Option key={value} value={value}>
        {name}
      </Option>
    ))}
  </Select>
);

export default FormSelectWidget;
