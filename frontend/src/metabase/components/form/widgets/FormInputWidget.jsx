import React from "react";

import cx from "classnames";

const FormInputWidget = ({ placeholder, field, offset }) => (
  <input
    className={cx("Form-input full", { "Form-offset": offset })}
    type="text"
    placeholder={placeholder}
    {...field}
  />
);

export default FormInputWidget;
