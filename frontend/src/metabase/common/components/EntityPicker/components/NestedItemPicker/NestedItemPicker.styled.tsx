// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { Box } from "metabase/ui";

export const ListBox = styled(Box)<React.PropsWithChildren>`
  border-right: 1px solid var(--mb-color-border);
  height: 100%;
  width: 365px;
  flex-basis: 365px;
  background-color: var(--mb-color-background-secondary);

  &:last-child {
    background-color: var(--mb-color-background-primary);
  }
` as unknown as typeof Box;
