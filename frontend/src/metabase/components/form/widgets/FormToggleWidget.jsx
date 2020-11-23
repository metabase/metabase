import React from "react";

import Toggle from "metabase/components/Toggle";

const FormToggleWidget = ({ field }) => (
  <Toggle aria-labelledby={`${field.name}-label`} {...field} />
);

export default FormToggleWidget;
