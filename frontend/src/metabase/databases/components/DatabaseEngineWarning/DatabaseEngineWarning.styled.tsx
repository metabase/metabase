// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { Alert } from "metabase/common/components/Alert";

export const Warning = styled(Alert)`
  margin-bottom: 2rem;
`;

export const WarningLink = styled.a`
  color: var(--mb-color-brand);
  cursor: pointer;
  font-weight: bold;
`;
