import { Box } from "grid-styled";
import styled from "styled-components";

import { SIDEBAR_WIDTH } from "metabase/collections/constants";
import { breakpointMinSmall } from "metabase/styled-components/theme/media-queries";

export const ContentBox = styled(Box)`
  background-color: white;
  display: ${props => (props.shouldDisplayMobileSidebar ? "none" : "block")};
  height: 100%;
  margin-left: ${props =>
    props.shouldDisplayMobileSidebar ? SIDEBAR_WIDTH : 0};
  overflow-y: auto;
  padding-bottom: 64px;

  ${breakpointMinSmall} {
    display: block;
    margin-left: ${SIDEBAR_WIDTH};
  }
`;
