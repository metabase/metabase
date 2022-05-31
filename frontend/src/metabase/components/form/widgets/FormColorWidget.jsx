/* eslint-disable react/prop-types */
import React from "react";

import { getForegroundColors } from "metabase/lib/colors/groups";
import ColorSelector from "metabase/core/components/ColorSelector";

const FormColorWidget = ({ field, initial }) => (
  <div>
    <ColorSelector
      {...field}
      value={field.value || initial()}
      colors={getForegroundColors()}
    />
  </div>
);

export default FormColorWidget;
