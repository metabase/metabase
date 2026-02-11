// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";

export const LogsContainer = styled(LoadingAndErrorWrapper)`
  height: 100%;
  display: flex;
  flex-direction: column;
`;

export const LogsContent = styled.div`
  border: 1px solid var(--mb-color-border);
  border-radius: 0.5rem;
  background-color: var(--mb-color-background-secondary);
  font-family: "Lucida Console", Monaco, monospace;
  font-size: 14px;
  white-space: pre;
  padding: 1em;
  overflow: auto;
  height: 100%;
`;
