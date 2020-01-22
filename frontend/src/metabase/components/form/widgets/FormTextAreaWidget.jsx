import React from "react";
import cx from "classnames";

const FormTextAreaWidget = ({ placeholder, field, monospaceText }) => (
  <textarea
    className={cx("Form-input full", { "text-monospace": monospaceText })}
    placeholder={placeholder}
    {...field}
  />
);

export default FormTextAreaWidget;
