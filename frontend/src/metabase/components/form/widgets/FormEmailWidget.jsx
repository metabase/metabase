import React from "react";

import { formDomOnlyProps } from "metabase/lib/redux";

const FormEmailWidget = ({ placeholder, field }) => (
  <input
    className="Form-input full"
    type="email"
    placeholder={placeholder}
    {...formDomOnlyProps(field)}
  />
);

export default FormEmailWidget;
