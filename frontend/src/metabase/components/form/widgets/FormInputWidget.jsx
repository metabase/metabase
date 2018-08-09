import React from "react";

import cx from "classnames";

import { formDomOnlyProps } from "metabase/lib/redux";

const FormInputWidget = ({ type = "text", placeholder, field, offset }) => (
  <input
    className={cx("Form-input full", { "Form-offset": offset })}
    type={type}
    placeholder={placeholder}
    {...formDomOnlyProps(field)}
  />
);

export default FormInputWidget;
