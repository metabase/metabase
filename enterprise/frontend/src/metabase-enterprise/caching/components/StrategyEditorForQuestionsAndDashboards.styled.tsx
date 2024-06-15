import styled from "@emotion/styled";

import { StyledTable } from "metabase/common/components/Table";

export const CacheableItemTable = styled(StyledTable)`
  background-color: var(--mb-color-text-white);
  tbody > tr:hover {
    background-color: inherit;
  }
  td {
    padding: 1rem;
  }
` as typeof StyledTable;
