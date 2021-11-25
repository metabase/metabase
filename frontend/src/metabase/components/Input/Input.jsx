import React from "react";
import PropTypes from "prop-types";
import { InputField, InputRoot } from "./Input.styled";

const propTypes = {
  error: PropTypes.bool,
  fullWidth: PropTypes.bool,
  startAdornment: PropTypes.node,
  endAdornment: PropTypes.node,
};

const Input = ({ error, fullWidth, startAdornment, endAdornment, ...rest }) => {
  return (
    <InputRoot fullWidth={fullWidth}>
      {startAdornment}
      <InputField {...rest} fullWidth={fullWidth} error={error} />
      {endAdornment}
    </InputRoot>
  );
};

Input.propTypes = propTypes;

export default Input;
