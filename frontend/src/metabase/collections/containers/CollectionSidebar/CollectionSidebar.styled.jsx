import styled, { css } from "styled-components";
import { Box } from "grid-styled";

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

export const Sidebar = styled(Box.withComponent("aside"))`
  bottom: 0;
  display: flex;
  flex-direction: column;
  left: 0;
  overflow-x: hidden;
  overflow-y: auto;
  padding-top: ${space(3)};
  position: fixed;
  top: 65px;
  width: 0;

  ${props =>
    props.shouldDisplayMobileSidebar &&
    css`
      box-shadow: 5px 0px 8px rgba(0, 0, 0, 0.35),
        40px 0px rgba(5, 14, 31, 0.32);
      width: calc(100vw - 40px);

      ${breakpointMinSmall} {
        box-shadow: none;
        width: ${SIDEBAR_WIDTH};
      }
    `}

  ${breakpointMinSmall} {
    width: ${SIDEBAR_WIDTH};
  }
`;

export const ToggleMobileSidebarIcon = styled(Icon).attrs({
  name: "close",
  size: 20,
})`
  color: ${color("brand")};
  // margin sizes hard-coded
  // for icon to land on
  // same position as burger icon
  // when sidebar is hidden in mobile
  margin: -4px ${space(2)} 0 30px};

  ${breakpointMinSmall} {
    cursor: pointer;
    display: none;
  }
`;
