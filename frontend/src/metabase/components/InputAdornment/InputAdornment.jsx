import React from "react";
import PropTypes from "prop-types";
import { InputAdornmentRoot } from "metabase/components/InputAdornment/InputAdornment.styled";

const propTypes = {
  position: PropTypes.oneOf(["start", "end"]),
  children: PropTypes.node,
};

const InputAdornment = ({ position, children }) => {
  return (
    <InputAdornmentRoot position={position}>{children}</InputAdornmentRoot>
  );
};

InputAdornment.propTypes = propTypes;

export default InputAdornment;
