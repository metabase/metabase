/* eslint-disable react/prop-types */
import React from "react";
import cx from "classnames";
import { formDomOnlyProps } from "metabase/lib/redux";

const FormTextFileWidget = ({ field, treatBeforePosting }) => {
  // setting value on a file input throws an error
  const { value, ...otherProps } = formDomOnlyProps(field); // eslint-disable-line no-unused-vars
  return (
    <input
      type="file"
      className={cx({ "Form-file-input--has-value": value }, "Form-file-input")}
      aria-labelledby={`${field.name}-label`}
      {...otherProps}
      onChange={wrapHandler(field.onChange, treatBeforePosting)}
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
      const text = treatOnLoadValue(fr.result, treatBeforePosting);
      console.log("🚀", { text });
      return h(text);
    };
    fr.readAsText(files[0]);
  };
}

function treatOnLoadValue(value, treatment) {
  console.log("🚀", { value, treatment });
  if (treatment === "base64") {
    return btoa(value);
  }

  return value;
}

export default FormTextFileWidget;
