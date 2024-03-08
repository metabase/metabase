/* eslint-disable react/prop-types */
import NumericInput from "metabase/components/NumericInput";
import { formDomOnlyProps } from "metabase/lib/redux";

const FormInputWidget = ({ placeholder, field }) => (
  <NumericInput
    className="Form-input full"
    placeholder={placeholder}
    aria-labelledby={`${field.name}-label`}
    {...formDomOnlyProps(field)}
  />
);

export default FormInputWidget;
