// eslint-disable-next-line no-restricted-imports
import { keyframes } from "@emotion/react";
// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { doNotForwardProps } from "metabase/common/utils/doNotForwardProps";
import Button from "metabase/core/components/Button";
import { color } from "metabase/lib/colors";
import { Icon } from "metabase/ui";

const expandKeyframes = keyframes`
  50% {
    transform: scale(1.3);
  }
`;

const shrinkKeyframes = keyframes`
  50% {
    transform: scale(0.8);
  }
`;

interface BookmarkIconProps {
  isBookmarked: boolean;
  isAnimating: boolean;
  onAnimationEnd: () => void;
}

export const BookmarkIcon = styled(
  Icon,
  doNotForwardProps("isBookmarked", "isAnimating"),
)<BookmarkIconProps>`
  color: ${props => (props.isBookmarked ? color("brand") : "")};
  animation-name: ${props =>
    props.isBookmarked ? expandKeyframes : shrinkKeyframes};
  animation-play-state: ${props => (props.isAnimating ? "running" : "paused")};
  animation-duration: 0.3s;
  animation-timing-function: linear;
`;

export const BookmarkButton = styled(Button)`
  padding: 0.25rem 0.5rem;
  height: 2rem;
  width: 2rem;

  &:hover {
    color: var(--mb-color-brand);
    background-color: var(--mb-color-bg-medium);
  }

  svg {
    vertical-align: middle;
  }
`;

BookmarkButton.defaultProps = {
  onlyIcon: true,
  iconSize: 16,
};
