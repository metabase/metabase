import styled from "styled-components";

import { color } from "metabase/lib/colors";

import Link from "metabase/components/Link";

export const ItemLink = styled(Link)`
  &:hover {
    color: ${color("brand")};
  }
`;

export const TableRow = styled.tr`
  height: 80px;
`;

export const TableItemSecondaryField = styled.p`
  font-size: 0.95em;
  font-weight: bold;
  color: ${color("text-dark")};
`;
