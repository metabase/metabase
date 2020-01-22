import React from "react";

import { formDomOnlyProps } from "metabase/lib/redux";

const FormTextAreaWidget = ({ placeholder, field }) => (
  <textarea
    className="Form-input full"
    placeholder={placeholder}
    aria-labelledby={`${field.name}-label`}
    {...formDomOnlyProps(field)}
  />
);

export default FormTextAreaWidget;
