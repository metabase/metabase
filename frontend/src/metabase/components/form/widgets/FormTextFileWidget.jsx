/* eslint-disable react/prop-types */
import React from "react";
import cx from "classnames";
import { formDomOnlyProps } from "metabase/lib/redux";

// This is a special-case widget
// setting value on a file input widget throws an error

const FormTextFileWidget = ({ field, treatBeforePosting }) => {
  const { value, ...otherProps } = formDomOnlyProps(field);

  return (
    <input
      type="file"
      className={cx(
        { "Form-file-input--has-value": value },
        "Form-file-input full",
      )}
      aria-labelledby={`${field.name}-label`}
      {...otherProps}
      onChange={wrapHandler(field.onChange, treatBeforePosting)}
      onBlur={wrapHandler(field.onBlur, treatBeforePosting)}
    />
  );
};

function wrapHandler(h, treatBeforePosting) {
  return ({ target: { files } }) => {
    if (files.length === 0) {
      h("");
    }

    const fr = new FileReader();

    fr.onload = () => h(fr.result);

    const [file] = files;

    if (treatBeforePosting === "base64") {
      fr.readAsDataURL(file);
    } else {
      fr.readAsText(file);
    }
  };
}

export default FormTextFileWidget;
