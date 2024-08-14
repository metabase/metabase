/* eslint-disable react/prop-types */
import { NumericInputBlurChange } from "./NumericInput.styled";

const NumericInput = ({ value, onChange, ...props }) => (
  <NumericInputBlurChange
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
