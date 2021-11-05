import React from "react";
import PropTypes from "prop-types";

import { isReducedMotionPreferred } from "metabase/lib/dom";

import Icon from "metabase/components/Icon";
import { SpinnerIcon, SpinnerRoot } from "./LoadingSpinner.styled";

const propTypes = {
  className: PropTypes.string,
  size: PropTypes.number,
  borderWidth: PropTypes.number,
};

const LoadingSpinner = ({ className, size = 32, borderWidth = 4 }) => (
  <SpinnerRoot className={className} data-testid="loading-spinner">
    {isReducedMotionPreferred() ? (
      <Icon name="hourglass" size="24" />
    ) : (
      <SpinnerIcon iconSize={size} borderWidth={borderWidth} />
    )}
  </SpinnerRoot>
);

LoadingSpinner.propTypes = propTypes;

export default LoadingSpinner;
