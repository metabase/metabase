/* eslint-disable react/prop-types */
import React from "react";

import { getNormalColors } from "metabase/lib/colors/charts";
import ColorSelector from "metabase/core/components/ColorSelector";

const FormColorWidget = ({ field, initial }) => (
  <div>
    <ColorSelector
      {...field}
      value={field.value || initial()}
      colors={getNormalColors()}
    />
  </div>
);

export default FormColorWidget;
