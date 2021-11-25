import React from "react";
import PropTypes from "prop-types";
import { formDomOnlyProps } from "metabase/lib/redux";
import Input from "metabase/components/Input";

// Important: do NOT use this as an input of type="file"
// For file inputs, See component FormTextFileWidget.jsx

const propTypes = {
  type: PropTypes.string,
  placeholder: PropTypes.string,
  field: PropTypes.object,
  readOnly: PropTypes.bool,
  autoFocus: PropTypes.bool,
};

const FormInputWidget = ({
  type = "text",
  placeholder,
  field,
  readOnly,
  autoFocus,
}) => (
  <Input
    type={type}
    placeholder={placeholder}
    aria-labelledby={`${field.name}-label`}
    readOnly={readOnly}
    autoFocus={autoFocus}
    fullWidth
    {...formDomOnlyProps(field)}
  />
);

FormInputWidget.propTypes = propTypes;

export default FormInputWidget;
