import React from "react";
import PropTypes from "prop-types";
import { InputField } from "./Input.styled";

const propTypes = {
  error: PropTypes.bool,
  fullWidth: PropTypes.bool,
};

const Input = ({ error, fullWidth, ...rest }) => {
  return <InputField {...rest} hasError={error} fullWidth={fullWidth} />;
};

Input.propTypes = propTypes;

export default Input;
