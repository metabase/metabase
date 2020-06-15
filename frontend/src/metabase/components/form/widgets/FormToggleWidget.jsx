import React from "react";

import Toggle from "metabase/components/Toggle";

const FormToggleWidget = ({ field }) => (
  <div>
    <Toggle aria-labelledby={`${field.name}-label`} {...field} />
  </div>
);

export default FormToggleWidget;
