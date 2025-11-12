// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import Toggle from "metabase/common/components/Toggle";

export const StepDescription = styled.div`
  margin: 0.875rem 0 1.25rem;
  color: var(--mb-color-text-secondary);
`;

export const StepToggleContainer = styled.div`
  display: flex;
  align-items: center;
  margin: 0 2rem 1.25rem 0;
  padding: 1rem;
  border: 2px solid var(--mb-color-border);
  border-radius: 0.5rem;
`;

export const StepToggle = styled(Toggle)`
  flex: 0 0 auto;
`;

export const StepToggleLabel = styled.div`
  color: var(--mb-color-text-secondary);
  margin-left: 0.5rem;
`;

export const StepInfoList = styled.ul`
  margin: 0 0 1.25rem;
  color: var(--mb-color-text-secondary);
  list-style: disc inside;
  line-height: 2;
`;

export const StepError = styled.div`
  color: var(--mb-color-error);
  margin-top: 0.5rem;
`;
