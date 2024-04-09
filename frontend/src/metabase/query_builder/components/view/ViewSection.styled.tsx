import styled from "@emotion/styled";

import { breakpointMinSmall } from "metabase/styled-components/theme";

export const ViewSectionRoot = styled.div`
  display: flex;
  align-items: center;
  padding-left: 0.5rem;
  padding-right: 0.5rem;

  ${breakpointMinSmall} {
    padding-left: 2rem;
    padding-right: 1rem;
  }
`;
