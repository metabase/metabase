/* eslint-disable react/prop-types */
import Toggle from "metabase/core/components/Toggle";

const FormBooleanWidget = ({ field }) => (
  <Toggle
    aria-labelledby={`${field.name}-label`}
    aria-checked={field.value}
    role="switch"
    {...field}
  />
);

export default FormBooleanWidget;
