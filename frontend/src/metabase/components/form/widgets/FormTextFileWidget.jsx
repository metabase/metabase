import React from "react";

import { formDomOnlyProps } from "metabase/lib/redux";

const FormTextFileWidget = ({ field }) => {
  const otherProps = formDomOnlyProps(field);
  delete otherProps.value; // setting value on a file input throws an error
  return (
    <input
      type="file"
      className="Form-input"
      aria-labelledby={`${field.name}-label`}
      {...otherProps}
      onChange={wrapHandler(field.onChange)}
      onBlur={wrapHandler(field.onBlur)}
    />
  );
};

function wrapHandler(h) {
  return async ({ target: { files } }) =>
    h(files.length === 0 ? "" : await files[0].text());
}

export default FormTextFileWidget;
