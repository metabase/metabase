import styled from "@emotion/styled";

import {
  breakpointMinSmall,
  breakpointMinLarge,
} from "metabase/styled-components/theme";

export const DashboardContainer = styled.div`
  padding-left: 0.5rem;
  padding-right: 0.5rem;

  ${breakpointMinSmall} {
    padding-left: 1rem;
    padding-right: 1rem;
  }

  ${breakpointMinLarge} {
    padding-left: 1.5rem;
    padding-right: 1.5rem;
  }

  padding-top: 0;
`;

export const DashboardGridContainer = styled.div`
  margin-top: 1rem;
`;
