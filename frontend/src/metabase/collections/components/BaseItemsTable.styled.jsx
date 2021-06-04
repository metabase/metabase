import styled from "styled-components";

import { color } from "metabase/lib/colors";

import EntityItem from "metabase/components/EntityItem";
import Link from "metabase/components/Link";

// Table row is wrapped with ItemDragSource,
// that only accepts native DOM elements as its children
// So styled-components can't be used here
export const TABLE_ROW_STYLE = {
  height: "80px",
  borderBottom: `1px solid ${color("border")}`,
};

export const EntityIconCheckBox = styled(EntityItem.IconCheckBox)`
  width: 3em;
  height: 3em;
`;

export const ItemLink = styled(Link)`
  &:hover {
    color: ${color("brand")};
  }
`;

export const TableItemSecondaryField = styled.p`
  font-size: 0.95em;
  font-weight: bold;
  color: ${color("text-dark")};
`;
