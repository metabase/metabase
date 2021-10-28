import React from "react";
import PropTypes from "prop-types";
import { SpinnerIcon } from "./LoadingSpinner.styled";

const propTypes = {
  className: PropTypes.string,
  size: PropTypes.number,
  borderWidth: PropTypes.number,
};

const LoadingSpinner = ({ className, size = 32, borderWidth = 4 }) => (
  <div className={className} data-testid="loading-spinner">
    <SpinnerIcon iconSize={size} borderWidth={borderWidth} />
  </div>
);

LoadingSpinner.propTypes = propTypes;

export default LoadingSpinner;
