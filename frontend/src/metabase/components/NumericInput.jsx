/* eslint-disable react/prop-types */
import React from "react";
import { NumbericInputBlurChange } from "./NumericInput.styled";

const NumericInput = ({ value, onChange, ...props }) => (
  <NumbericInputBlurChange
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
