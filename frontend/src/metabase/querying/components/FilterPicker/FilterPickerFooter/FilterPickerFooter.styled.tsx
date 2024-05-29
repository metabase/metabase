import styled from "@emotion/styled";

import { Flex } from "metabase/ui";

export const FilterFooterRoot = styled(Flex)`
  &:not(:only-child) {
    border-top: 1px solid var(--mb-color-border);
  }
`;
