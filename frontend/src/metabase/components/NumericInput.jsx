/* eslint-disable react/prop-types */
import React from "react";

import InputBlurChange from "metabase/components/InputBlurChange";

const NumericInput = ({ value, onChange, ...props }) => (
  <InputBlurChange
    value={value == null ? "" : String(value)}
    onBlurChange={({ target: { value } }) => {
      value = value ? parseFloat(value) : null;
      if (!isNaN(value)) {
        onChange(value);
      }
    }}
    {...props}
  />
);

export default NumericInput;
