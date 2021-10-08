/* eslint-disable react/prop-types */
import React from "react";
import cx from "classnames";
import { formDomOnlyProps } from "metabase/lib/redux";

// This is a special-case widget
// setting value on a file input widget throws an error

const FormTextFileWidget = ({ field }) => {
  const { value, ...otherProps } = formDomOnlyProps(field);
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

function wrapHandler(h, treatBeforePosting) {
  return ({ target: { files } }) => {
    if (files.length === 0) {
      h("");
    }
    const fr = new FileReader();
    fr.onload = () => {
      return h(fr.result);
    };
    fr.readAsText(files[0]);
  };
}

export default FormTextFileWidget;
