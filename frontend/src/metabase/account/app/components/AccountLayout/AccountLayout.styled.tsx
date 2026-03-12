// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { breakpointMinSmall } from "metabase/styled-components/theme";

export const AccountContent = styled.div`
  margin: 0 auto;
  padding: var(--mantine-spacing-sm);

  ${breakpointMinSmall} {
    width: 540px;
    padding: var(--mantine-spacing-xl) var(--mantine-spacing-md);
  }
`;
