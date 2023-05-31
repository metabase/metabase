import React from "react";

import { isReducedMotionPreferred } from "metabase/lib/dom";

import { Icon } from "metabase/core/components/Icon";
import { SpinnerIcon, SpinnerRoot } from "./LoadingSpinner.styled";

interface Props {
  className?: string;
  size?: number;
  borderWidth?: number;
}

const LoadingSpinner = ({ className, size = 32, borderWidth = 4 }: Props) => (
  <SpinnerRoot className={className} data-testid="loading-spinner">
    {isReducedMotionPreferred() ? (
      <Icon name="hourglass" size="24" />
    ) : (
      <SpinnerIcon iconSize={size} borderWidth={borderWidth} />
    )}
  </SpinnerRoot>
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Object.assign(LoadingSpinner, {
  Root: SpinnerRoot,
});
