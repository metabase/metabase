/* eslint-disable react/prop-types */
import React from "react";

import Toggle from "metabase/components/Toggle";

const FormToggleWidget = ({ field }) => (
  <Toggle
    aria-labelledby={`${field.name}-label`}
    aria-checked={field.value}
    role="switch"
    {...field}
  />
);

export default FormToggleWidget;
