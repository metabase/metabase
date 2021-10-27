import React from "react";
import PropTypes from "prop-types";
import { SpinnerIcon } from "./LoadingSpinner.styled";

const propTypes = {
  className: PropTypes.string,
  size: PropTypes.number,
  compact: PropTypes.bool,
};

const LoadingSpinner = ({ className, size, compact }) => (
  <div className={className} data-testid="loading-spinner">
    <SpinnerIcon style={{ width: size, height: size }} />
  </div>
);

LoadingSpinner.propTypes = propTypes;

export default LoadingSpinner;
