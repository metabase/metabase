import styled from "@emotion/styled";

import Link from "metabase/core/components/Link";

export const CollectionBadgeRoot = styled.div`
  display: inline-block;
`;

export const CollectionLink = styled(Link)`
  display: flex;
  align-items: center;
  text-decoration: dashed;

  &:hover {
    color: var(--mb-color-brand);
  }
`;
