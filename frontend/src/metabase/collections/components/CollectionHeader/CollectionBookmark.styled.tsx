import styled from "@emotion/styled";
import { keyframes } from "@emotion/react";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";

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
  isChanged: boolean;
}

export const BookmarkIcon = styled(Icon)<BookmarkIconProps>`
  color: ${props => (props.isBookmarked ? color("brand") : "")};
  animation-name: ${props =>
    props.isBookmarked ? expandKeyframes : shrinkKeyframes};
  animation-play-state: ${props => (props.isChanged ? "running" : "paused")};
  animation-duration: 0.3s;
  animation-timing-function: linear;
`;
