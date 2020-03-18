import React from "react";

import { formDomOnlyProps } from "metabase/lib/redux";

const FormTextAreaWidget = ({
  placeholder,
  field,
  updateInputProps = () => undefined,
}) => {
  const props = {
    className: "Form-input full",
    placeholder,
    "aria-labelledby": `${field.name}-label`,
    ...formDomOnlyProps(field),
  };

  return <textarea {...props} {...updateInputProps(props)} />;
};

export default FormTextAreaWidget;
