import styled from "@emotion/styled";

import { Box } from "metabase/ui";

export const ListBox = styled(Box)<React.PropsWithChildren>`
  border-right: 1px solid var(--mb-color-border);
  height: 100%;
  width: 365px;
  flex-basis: 365px;
  background-color: var(--mb-color-bg-light);

  &:last-child {
    background-color: white;
  }
`;
