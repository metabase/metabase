import React from "react";

import ColorPicker from "metabase/components/ColorPicker";
import cx from "classnames";

const FormColorWidget = ({ field, offset }) => (
  <div className={cx({ "Form-offset": offset })}>
    <ColorPicker {...field} />
  </div>
);

export default FormColorWidget;
