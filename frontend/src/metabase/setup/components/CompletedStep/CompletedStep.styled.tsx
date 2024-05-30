import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

export const StepRoot = styled.section`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 2rem;
  margin-bottom: 1.75rem;
  border: 1px solid var(--mb-color-border);
  border-radius: 0.5rem;
  background-color: var(--mb-color-bg-white);
`;

export const StepTitle = styled.div`
  color: var(--mb-color-text-light);
  padding: 1rem 0;
  font-size: 2rem;
  font-weight: 700;
`;

export const StepBody = styled.div`
  padding-top: 2rem;
`;

export const StepFooter = styled.div`
  padding: 2rem 0 1rem;
`;
