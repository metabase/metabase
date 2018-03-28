import React from "react";

import Select, { Option } from "metabase/components/Select";
import cx from "classnames";

const FormSelectWidget = ({ placeholder, options = [], field, offset }) => (
  <Select
    // className={cx("Form-input full", { "Form-offset": offset })}
    placeholder={placeholder}
    {...field}
    // react-redux expects to be raw value
    onChange={e => field.onChange(e.target.value)}
  >
    {options.map(({ name, value }) => (
      <Option key={value} value={value}>
        {name}
      </Option>
    ))}
  </Select>
);

export default FormSelectWidget;
