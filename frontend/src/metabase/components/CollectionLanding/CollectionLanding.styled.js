import { Box } from "grid-styled";
import styled from "styled-components";

import { SIDEBAR_WIDTH } from "metabase/collections/constants";

export const ContentBox = styled(Box)`
  background-color: white;
  display: ${props => (props.showMobileSidebar ? "none" : "block")};
  height: 100%;
  margin-left: ${props => (props.showMobileSidebar ? SIDEBAR_WIDTH : 0)};
  overflow-y: auto;
  padding-bottom: 64px;

  @media screen and (min-width: 768px) {
    display: block;
    margin-left: ${SIDEBAR_WIDTH};
  }
`;
