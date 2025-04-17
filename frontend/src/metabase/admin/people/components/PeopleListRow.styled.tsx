// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import Link from "metabase/core/components/Link";

export const RefreshLink = styled(Link)`
  color: var(--mb-color-text-light);
  cursor: pointer;

  &:hover {
    color: var(--mb-color-brand);
  }
`;
