import React from "react";
import PropTypes from "prop-types";

import cx from "classnames";

export default FormTextArea;

FormTextArea.propTypes = {
  input: PropTypes.object.isRequired,
  meta: PropTypes.object.isRequired,
  className: PropTypes.string,
  placeholder: PropTypes.string,
};

function FormTextArea({ input, meta, placeholder, className }) {
  const { active, invalid, visited } = meta;
  return (
    <textarea
      placeholder={placeholder}
      className={cx(
        "input full",
        { "border-error": !active && visited && invalid },
        className,
      )}
      {...input}
    />
  );
}
