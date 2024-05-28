import styled from "@emotion/styled";

import { GridItem } from "metabase/components/Grid";

export const ListRoot = styled.div`
  padding: 0 4rem;
`;

export const ListHeader = styled.div`
  padding: 1rem 0;
`;

export const ListGridItem = styled(GridItem)`
  width: 33.33%;

  &:hover {
    color: var(--mb-color-brand);
  }
`;

export const CardContent = styled.div`
  display: flex;
  align-items: center;
`;
