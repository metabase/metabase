import styled from "@emotion/styled";
import { css } from "@emotion/react";

import { color } from "metabase/lib/colors";
import { breakpointMinSmall, space } from "metabase/styled-components/theme";
import {
  shrinkOrExpandOnClick,
  shrinkOrExpandDuration,
} from "metabase/styled-components/theme/button.ts";

import Icon, { IconWrapper } from "metabase/components/Icon";

export const BookmarkIconWrapper = styled(IconWrapper)`
  ${props =>
    !props.isBookmarked &&
    css`
      &:hover {
        ${BookmarkIcon} {
          color: ${color("text-dark")};
        }
      }
    `}
`;
export const BookmarkIcon = styled(Icon)`
  ${shrinkOrExpandOnClick}

  ${props =>
    props.animation === "expand" &&
    css`
      animation: expand linear ${shrinkOrExpandDuration};
    `}

  ${props =>
    props.animation === "shrink" &&
    css`
      animation: shrink linear ${shrinkOrExpandDuration};
    `}
`;

export const Container = styled.div`
  display: flex;
  justify-content: space-between;
  flex-direction: column;
  margin-bottom: ${space(3)};
  padding-top: ${space(0)};

  ${breakpointMinSmall} {
    align-items: center;
    flex-direction: row;
    padding-top: ${space(1)};
  }
`;

export const MenuContainer = styled.div`
  display: flex;
  margin-top: ${space(1)};
  align-self: start;
`;

export const DescriptionTooltipIcon = styled(Icon)`
  color: ${color("bg-dark")};
  margin-left: ${space(1)};
  margin-right: ${space(1)};
  margin-top: ${space(0)};

  &:hover {
    color: ${color("brand")};
  }
`;

DescriptionTooltipIcon.defaultProps = {
  name: "info",
};

export const DescriptionHeading = styled.div`
  font-size: 1rem;
  line-height: 1.5rem;
  padding-top: 1.15rem;
  max-width: 400px;
`;

export const TitleContent = styled.div`
  display: flex;
  align-items: center;
`;
