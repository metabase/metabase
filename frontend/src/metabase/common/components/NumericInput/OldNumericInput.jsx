/* eslint-disable react/prop-types */
import { TextInputBlurChange } from "metabase/ui";

/**
 * @deprecated: use NumberInput from "metabase/ui"
 * */
const NumericInput = ({ value, onChange, ...props }) => (
  <TextInputBlurChange
    w="auto"
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
