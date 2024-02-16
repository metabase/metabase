import styled from "@emotion/styled";

import { breakpointMinSmall } from "metabase/styled-components/theme";

export const EmptyStateHeader = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
`;

export const EmptyStateFooter = styled.div`
  display: flex;
  margin-top: 1rem;
`;

export const EmptyStateActions = styled.div`
  display: flex;
  align-items: center;
  margin: 0 auto;
`;

export const EmptyStateIllustration = styled.div`
  margin-bottom: 1rem;

  ${breakpointMinSmall} {
    margin-bottom: 2rem;
  }
`;
