/* eslint-disable react/prop-types */
import React from "react";

import { getDistinctColors } from "metabase/lib/colors/groups";
import ColorSelector from "metabase/core/components/ColorSelector";

const FormColorWidget = ({ field, initial }) => (
  <div>
    <ColorSelector
      {...field}
      value={field.value || initial()}
      colors={getDistinctColors()}
    />
  </div>
);

export default FormColorWidget;
