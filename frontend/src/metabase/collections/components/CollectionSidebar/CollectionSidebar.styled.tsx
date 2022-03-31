import styled from "@emotion/styled";
import { css } from "@emotion/react";
import { space } from "metabase/styled-components/theme";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";
import { breakpointMinSmall } from "metabase/styled-components/theme/media-queries";

import { SIDEBAR_WIDTH } from "metabase/collections/constants";

export const LoadingContainer = styled.div`
  color: ${color("brand")};
  text-align: center;
`;

export const LoadingTitle = styled.h2`
  color: ${color("text-light")};
  font-weight: 400;
  margin-top: ${space(1)};
`;

export const Sidebar = styled.aside`
  bottom: 0;
  display: flex;
  box-sizing: border-box;
  flex-direction: column;
  left: 0;
  overflow-x: hidden;
  overflow-y: auto;
  padding-top: ${space(1)};
  width: 0;
  background-color: transparent;

  ${breakpointMinSmall} {
    width: ${SIDEBAR_WIDTH};
  }
`;

export const SidebarHeading = styled.h4`
  color: ${color("text-medium")};
  font-size: 12px;
  font-weight: 700;
  font-size: 11px;
  margin-left: ${space(2)};
  text-transform: uppercase;
  letter-spacing: 0.45px;
  letter-spacing: 0.5px;
  margin-left: ${space(3)};
  text-transform: uppercase;
  user-select: none;

  ${({ onClick }) =>
    onClick &&
    css`
      cursor: pointer;

      &:hover {
        color: ${color("text-dark")};
      }
    `};
`;

interface ToggleListDisplayButtonProps {
  shouldDisplayBookmarks: boolean;
}

export const ToggleListDisplayButton = styled(Icon)<
  ToggleListDisplayButtonProps
>`
  margin-left: 4px;
  transform: translate(0px, -1px);

  ${({ shouldDisplayBookmarks }) =>
    shouldDisplayBookmarks &&
    css`
      transform: rotate(90deg) translate(-1px, -1px);
    `}
`;
