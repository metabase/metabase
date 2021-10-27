import React from "react";
import PropTypes from "prop-types";
import {
  LoadingSpinnerIcon,
  LoadingSpinnerRoot,
} from "./LoadingSpinner.styled";

const propTypes = {
  className: PropTypes.string,
  size: PropTypes.number,
};

const LoadingSpinner = ({ className, size }) => (
  <LoadingSpinnerRoot className={className} data-testid="loading-spinner">
    <LoadingSpinnerIcon style={{ width: size, height: size }} />
  </LoadingSpinnerRoot>
);

LoadingSpinner.propTypes = propTypes;

export default LoadingSpinner;
