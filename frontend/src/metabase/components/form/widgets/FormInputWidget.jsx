/* eslint-disable react/prop-types */
import React from "react";

import { formDomOnlyProps } from "metabase/lib/redux";

const FormInputWidget = ({
  type = "text",
  placeholder,
  field,
  readOnly,
  autoFocus,
}) => (
  <input
    className="Form-input full"
    type={type}
    placeholder={placeholder}
    aria-labelledby={`${field.name}-label`}
    readOnly={readOnly}
    autoFocus={autoFocus}
    {...formDomOnlyProps(field)}
  />
);

export default FormInputWidget;
