import styled from "@emotion/styled";

import { PublicComponentWrapper } from "embedding-sdk/components/private/PublicComponentWrapper";

export const StyledPublicComponentWrapper = styled(PublicComponentWrapper)`
  min-height: 100vh;
  background: var(--mb-color-bg-dashboard);
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  align-items: stretch;
  overflow: auto;
`;
