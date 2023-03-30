import styled from "@emotion/styled";
import {
  breakpointMaxMedium,
  breakpointMaxSmall,
} from "metabase/styled-components/theme";

export const MetabotFeedbackRoot = styled.div`
  padding: 1rem 2rem;
`;

export const MetabotFeedbackContent = styled.div`
  display: flex;
  flex-direction: row;
  gap: 1rem;

  ${breakpointMaxMedium} {
    flex-direction: column;
  }
`;

export const FeedbackOptions = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;

  ${breakpointMaxSmall} {
    flex-direction: column;
    align-items: stretch;
    gap: 0.5rem;
  }
`;
