import styled from "styled-components";
import { Box } from "grid-styled";

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
  width: ${props => (props.showMobileSidebar ? SIDEBAR_WIDTH : 0)};

  @media screen and (min-width: 768px) {
    width: ${SIDEBAR_WIDTH};
  }
`;
