import React from "react";

import cx from "classnames";

const FormTextAreaWidget = ({ placeholder, field, offset }) => (
  <textarea
    className={cx("Form-input full", { "Form-offset": offset })}
    placeholder={placeholder}
    {...field}
  />
);

export default FormTextAreaWidget;
