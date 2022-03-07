import styled from "@emotion/styled";

import { breakpointMinSmall } from "metabase/styled-components/theme/media-queries";

export const ContentBox = styled.div`
  display: ${props => (props.shouldDisplayMobileSidebar ? "none" : "block")};
  height: 100%;
  overflow-y: auto;
  padding-bottom: 64px;

  ${breakpointMinSmall} {
    display: block;
  }
`;
