import React from "react";

import ColorPicker from "metabase/components/ColorPicker";

const FormColorWidget = ({ field, initial }) => (
  <div>
    <ColorPicker
      {...field}
      value={
        // if the field has a value use that, otherwise use the initial
        field.value || initial()
      }
    />
  </div>
);

export default FormColorWidget;
