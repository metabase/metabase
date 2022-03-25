import styled from "@emotion/styled";

import { breakpointMinSmall } from "metabase/styled-components/theme/media-queries";

export const ContentBox = styled.div`
  display: ${props => (props.shouldDisplayMobileSidebar ? "none" : "block")};
  overflow-y: auto;

  ${breakpointMinSmall} {
    display: block;
  }
`;
