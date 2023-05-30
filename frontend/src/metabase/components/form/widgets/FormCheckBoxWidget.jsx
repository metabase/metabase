/* eslint-disable react/prop-types */
import React from "react";
import { CheckBox } from "metabase/core/components/CheckBox";

import { formDomOnlyProps } from "metabase/lib/redux";

const FormCheckBoxWidget = ({ field }) => (
  <CheckBox
    {...formDomOnlyProps(field)}
    checked={field.value}
    onChange={e => field.onChange(e.target.checked)}
  />
);

export default FormCheckBoxWidget;
