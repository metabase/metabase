import React from "react";

import ColorPicker from "metabase/components/ColorPicker";
import cx from "classnames";

const FormColorWidget = ({ field, offset, initial }) => (
  <div className={cx({ "Form-offset": offset })}>
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
