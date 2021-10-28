import React from "react";
import PropTypes from "prop-types";
import { SpinnerIcon, SpinnerRoot } from "./LoadingSpinner.styled";

const propTypes = {
  className: PropTypes.string,
  size: PropTypes.number,
  borderWidth: PropTypes.number,
};

const LoadingSpinner = ({ className, size = 32, borderWidth = 4 }) => (
  <SpinnerRoot className={className} data-testid="loading-spinner">
    <SpinnerIcon iconSize={size} borderWidth={borderWidth} />
  </SpinnerRoot>
);

LoadingSpinner.propTypes = propTypes;

export default LoadingSpinner;
