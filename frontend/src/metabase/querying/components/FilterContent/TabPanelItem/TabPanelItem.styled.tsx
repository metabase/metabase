import styled from "@emotion/styled";

import { Box, type BoxProps } from "metabase/ui";

interface ColumnItemRootProps extends BoxProps {
  component?: string;
}

export const TabPanelItem = styled(Box)<ColumnItemRootProps>`
  border-bottom: 1px solid var(--mb-color-border);
  padding: 1rem 2rem;
  padding-left: 0;

  &:last-of-type {
    border-bottom: none;
  }

  &:hover,
  :focus-within {
    background-color: var(--mb-color-bg-light);
  }
`;
