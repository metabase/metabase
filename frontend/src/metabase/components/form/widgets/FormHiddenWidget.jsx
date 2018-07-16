import React from "react";

import { formDomOnlyProps } from "metabase/lib/redux";

const FormHiddenWidget = ({ type = "hidden", field }) => (
  <input type={type} {...formDomOnlyProps(field)} />
);

export default FormHiddenWidget;
