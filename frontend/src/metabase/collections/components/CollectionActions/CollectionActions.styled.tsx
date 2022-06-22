import styled from "@emotion/styled";
import { keyframes } from "@emotion/react";
import { color } from "metabase/lib/colors";
import Icon, { IconWrapper } from "metabase/components/Icon";

const expand = keyframes`
  50% {
    transform: scale(1.3);
  }
`;

const shrink = keyframes`
  50% {
    transform: scale(0.8);
  }
`;

export interface BookmarkIconProps {
  isBookmarked: boolean;
  isChanged: boolean;
}

export const BookmarkIcon = styled(Icon)<BookmarkIconProps>`
  width: 1.25rem;
  height: 1.25rem;
  color: ${props => (props.isBookmarked ? color("brand") : "")};
  animation-name: ${props =>
    props.isChanged ? (props.isBookmarked ? expand : shrink) : ""};
  animation-duration: 0.3s;
  animation-timing-function: linear;
`;

export interface BookmarkIconWrapperProps {
  isBookmarked: boolean;
}

export const BookmarkIconWrapper = styled(IconWrapper)<
  BookmarkIconWrapperProps
>`
  &:hover {
    ${BookmarkIcon} {
      color: ${props => (props.isBookmarked ? "" : color("text-dark"))};
    }
  }
`;
