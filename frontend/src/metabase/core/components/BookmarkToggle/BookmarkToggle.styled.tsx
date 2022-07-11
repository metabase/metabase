import styled from "@emotion/styled";
import { keyframes } from "@emotion/react";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";
import Button from "metabase/core/components/Button";

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

export interface BookmarkIconProps {
  isBookmarked: boolean;
  isAnimating: boolean;
  onAnimationEnd: () => void;
}

export const BookmarkIcon = styled(Icon)<BookmarkIconProps>`
  color: ${props => (props.isBookmarked ? color("brand") : "")};
  animation-name: ${props =>
    props.isBookmarked ? expandKeyframes : shrinkKeyframes};
  animation-play-state: ${props => (props.isAnimating ? "running" : "paused")};
  animation-duration: 0.3s;
  animation-timing-function: linear;
`;

interface BookmarkButtonProps {
  hoverColor: string;
}

export const BookmarkButton = styled(Button)<BookmarkButtonProps>`
  padding: 0.5rem 0.75rem;
  box-sizing: content-box;
  height: 1.5rem;

  &:hover {
    color: ${({ hoverColor }) => hoverColor};
    background-color: ${color("bg-medium")};
  }

  svg {
    vertical-align: middle;
  }
`;

BookmarkButton.defaultProps = {
  onlyIcon: true,
};
