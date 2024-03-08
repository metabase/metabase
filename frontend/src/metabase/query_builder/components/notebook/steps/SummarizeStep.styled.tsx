import styled from "@emotion/styled";

import { breakpointMinSmall } from "metabase/styled-components/theme";

export const StepRoot = styled.div`
  display: flex;
  align-items: center;
  flex-direction: column;

  ${breakpointMinSmall} {
    flex-direction: row;
  }
`;

export interface StepLabelProps {
  color?: string;
}

export const StepLabel = styled.div<StepLabelProps>`
  color: ${props => props.color};
  margin: 0.5rem 0;
  font-weight: bold;

  ${breakpointMinSmall} {
    margin: 0 1rem;
  }
`;

export const StepContainer = styled.div`
  width: 100%;

  ${breakpointMinSmall} {
    width: 50%;
  }
`;
