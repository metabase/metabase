import styled from "styled-components";

import { color } from "metabase/lib/colors";

import EntityItem from "metabase/components/EntityItem";
import Link from "metabase/components/Link";

export const EntityIconCheckBox = styled(EntityItem.IconCheckBox)`
  width: 3em;
  height: 3em;
`;

export const ItemLink = styled(Link)`
  &:hover {
    color: ${color("brand")};
  }
`;

export const TableRow = styled.tr`
  height: 80px;
  border-bottom: 1px solid ${color("bg-medium")};
`;

export const TableItemSecondaryField = styled.p`
  font-size: 0.95em;
  font-weight: bold;
  color: ${color("text-dark")};
`;
