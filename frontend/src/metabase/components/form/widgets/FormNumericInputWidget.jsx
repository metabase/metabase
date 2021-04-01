/* eslint-disable react/prop-types */
import React from "react";

import { formDomOnlyProps } from "metabase/lib/redux";

import NumericInput from "metabase/components/NumericInput";

const FormInputWidget = ({ placeholder, field }) => (
  <NumericInput
    className="Form-input full"
    placeholder={placeholder}
    aria-labelledby={`${field.name}-label`}
    {...formDomOnlyProps(field)}
  />
);

export default FormInputWidget;
