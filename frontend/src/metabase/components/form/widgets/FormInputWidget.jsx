import React, { forwardRef } from "react";
import PropTypes from "prop-types";
import { formDomOnlyProps } from "metabase/lib/redux";
import Input from "metabase/components/Input/Input";

// Important: do NOT use this as an input of type="file"
// For file inputs, See component FormTextFileWidget.jsx

const propTypes = {
  type: PropTypes.string,
  placeholder: PropTypes.string,
  field: PropTypes.object,
  readOnly: PropTypes.bool,
  autoFocus: PropTypes.bool,
  helperText: PropTypes.node,
  tabIndex: PropTypes.string,
};

const FormInputWidget = forwardRef(function FormInputWidget(
  {
    type = "text",
    placeholder,
    field,
    readOnly,
    autoFocus,
    helperText,
    tabIndex,
  },
  ref,
) {
  return (
    <Input
      {...formDomOnlyProps(field)}
      type={type}
      placeholder={placeholder}
      aria-labelledby={`${field.name}-label`}
      readOnly={readOnly}
      autoFocus={autoFocus}
      error={field.visited && !field.active && field.error != null}
      helperText={helperText}
      fullWidth
      tabIndex={tabIndex}
      ref={ref}
    />
  );
});

FormInputWidget.propTypes = propTypes;

export default FormInputWidget;
