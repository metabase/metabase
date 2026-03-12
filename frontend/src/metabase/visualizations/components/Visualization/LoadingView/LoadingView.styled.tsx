// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { LoadingSpinner } from "metabase/common/components/LoadingSpinner";

export const Root = styled.div`
  display: flex;
  flex: 1 0 auto;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 0.5rem;
  color: var(--mb-color-brand);
`;

export const SlowQueryMessageContainer = styled.div`
  color: var(--mb-color-text-secondary);
`;

export const ShortMessage = styled.span`
  font-weight: bold;
  font-size: 1.12em;
  margin-bottom: 0.5rem;
`;

export const Duration = styled.span`
  white-space: nowrap;
`;

export const StyledLoadingSpinner = styled(LoadingSpinner)`
  color: var(--mb-color-text-secondary);
`;
