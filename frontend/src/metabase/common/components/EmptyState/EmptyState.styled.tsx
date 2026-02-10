// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { breakpointMinSmall } from "metabase/styled-components/theme";

export const EmptyStateHeader = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
`;

export const EmptyStateActions = styled.div`
  display: flex;
  align-items: center;
  margin: 0 auto;
`;

export interface EmptyStateIllustrationProps {
  spacing: "sm" | "md";
}

export const EmptyStateIllustration = styled.div<EmptyStateIllustrationProps>`
  margin-bottom: 1rem;

  /* Defaults to "md" spacing, "sm" forces always 1rem */
  ${breakpointMinSmall} {
    margin-bottom: ${(props) => (props.spacing === "sm" ? "1rem" : "2rem")};
  }
`;
