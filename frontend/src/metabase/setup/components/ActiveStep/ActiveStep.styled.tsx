import styled from "@emotion/styled";

import { breakpointMinSmall } from "metabase/styled-components/theme";

export const StepRoot = styled.section`
  position: relative;
  padding: 2rem;
  margin-bottom: 1.75rem;
  border: 1px solid var(--mb-color-border);
  border-radius: 0.5rem;
  background-color: var(--mb-color-bg-white);

  ${breakpointMinSmall} {
    padding: 4rem;
  }
`;

export const StepTitle = styled.div`
  color: var(--mb-color-brand);
  font-size: 1.3125rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
`;

export const StepLabel = styled.div`
  position: absolute;
  top: 3.5rem;
  left: 0;
  transform: translate(-50%, 0);
  display: flex;
  justify-content: center;
  align-items: center;
  width: 2.625rem;
  height: 2.625rem;
  border: 1px solid var(--mb-color-border);
  border-radius: 50%;
  background-color: var(--mb-color-bg-white);
`;

export const StepLabelText = styled.span`
  color: var(--mb-color-brand);
  font-weight: 700;
  line-height: 1;
`;

export const StepDescription = styled.div`
  color: var(--mb-color-text-medium);
  margin: 0.875rem 0;
`;
