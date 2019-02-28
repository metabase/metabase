import React from "react";

import cx from "classnames";

import { formDomOnlyProps } from "metabase/lib/redux";

import NumericInput from "metabase/components/NumericInput";

const FormInputWidget = ({ placeholder, field, offset }) => (
  <NumericInput
    className={cx("Form-input full", { "Form-offset": offset })}
    placeholder={placeholder}
    {...formDomOnlyProps(field)}
  />
);

export default FormInputWidget;
