import styled from "styled-components";
import { Box } from "grid-styled";

import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";

import { SIDEBAR_WIDTH } from "metabase/collections/constants";

export const Sidebar = styled(Box.withComponent("aside"))`
  bottom: 0;
  display: flex;
  flex-direction: column;
  left: 0;
  overflow-x: hidden;
  overflow-y: auto;
  padding-top: 32px;
  position: fixed;
  top: 65px;
  width: ${props => (props.showMobileSidebar ? "100vw" : 0)};

  @media screen and (min-width: 768px) {
    width: ${SIDEBAR_WIDTH};
  }
`;

export const ToggleMobileSidebarIcon = styled(Icon).attrs({
  ml: 3,
  mr: 2,
  mt: "4px",
  name: "close",
  size: 20,
})`
  color: ${color("brand")};

  @media screen and (min-width: 768px) {
    cursor: pointer;
    display: none;
  }
`;
