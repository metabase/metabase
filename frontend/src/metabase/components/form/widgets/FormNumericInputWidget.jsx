import React from "react";

import { formDomOnlyProps } from "metabase/lib/redux";

import NumericInput from "metabase/components/NumericInput";

const FormInputWidget = ({ placeholder, field }) => (
  <NumericInput
    className="Form-input full"
    placeholder={placeholder}
    {...formDomOnlyProps(field)}
  />
);

export default FormInputWidget;
