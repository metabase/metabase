import styled from "@emotion/styled";

import Alert from "metabase/core/components/Alert";

export const Warning = styled(Alert)`
  margin-bottom: 2rem;
`;

export const WarningLink = styled.a`
  color: var(--mb-color-brand);
  cursor: pointer;
  font-weight: bold;
`;
