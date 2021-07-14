import React from "react";
import PropTypes from "prop-types";
import cx from "classnames";

export default FormInput;

FormInput.propTypes = {
  input: PropTypes.object.isRequired,
  meta: PropTypes.object.isRequired,
  placeholder: PropTypes.string,
  className: PropTypes.string,
};

function FormInput({ input, meta, placeholder, className }) {
  const { active, visited, invalid } = meta;
  return (
    <input
      type="text"
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
