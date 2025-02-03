import styled from "@emotion/styled";

import Link from "metabase/core/components/Link";

export const CardTitle = styled.span`
  font-weight: 700;
`;

export const CardListItem = styled(Link)`
  display: flex;
  flex-direction: row;
  align-items: center;
  width: 100%;
  border-radius: 8px;
  padding: 1rem 0.5rem;
`;
