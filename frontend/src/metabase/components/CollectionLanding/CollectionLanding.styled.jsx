import styled from "@emotion/styled";

import { SIDEBAR_WIDTH } from "metabase/collections/constants";
import { breakpointMinSmall } from "metabase/styled-components/theme/media-queries";

export const ContentBox = styled.div`
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
