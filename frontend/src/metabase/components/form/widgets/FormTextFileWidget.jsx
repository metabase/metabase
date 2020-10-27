import React from "react";
import cx from "classnames";
import { formDomOnlyProps } from "metabase/lib/redux";

const FormTextFileWidget = ({ field }) => {
  // setting value on a file input throws an error
  const { value, ...otherProps } = formDomOnlyProps(field); // eslint-disable-line no-unused-vars
  return (
    <input
      type="file"
      className={cx({ "Form-file-input--has-value": value }, "Form-file-input")}
      aria-labelledby={`${field.name}-label`}
      {...otherProps}
      onChange={wrapHandler(field.onChange)}
      onBlur={wrapHandler(field.onBlur)}
    />
  );
};

function wrapHandler(h) {
  return ({ target: { files } }) => {
    if (files.length === 0) {
      h("");
    }
    const fr = new FileReader();
    fr.onload = () => h(fr.result);
    fr.readAsText(files[0]);
  };
}

export default FormTextFileWidget;
