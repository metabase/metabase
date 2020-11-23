import CheckBox from "metabase/components/CheckBox";

import React from "react";

import { formDomOnlyProps } from "metabase/lib/redux";

const FormCheckBoxWidget = ({ field }) => (
  <CheckBox
    {...formDomOnlyProps(field)}
    onChange={e => field.onChange(e.target.checked)}
  />
);

export default FormCheckBoxWidget;
