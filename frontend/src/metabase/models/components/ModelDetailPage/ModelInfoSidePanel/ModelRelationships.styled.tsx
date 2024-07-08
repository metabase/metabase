import styled from "@emotion/styled";

import Link from "metabase/core/components/Link";
import { color, darken } from "metabase/lib/colors";

import { valueBlockStyle } from "./ModelInfoSidePanel.styled";

export const List = styled.ul`
  ${valueBlockStyle}

  li:not(:first-of-type) {
    margin-top: 6px;
  }
`;

export const ListItemName = styled.span`
  display: block;
`;

export const ListItemLink = styled(Link)`
  display: flex;
  align-items: center;
  color: ${color("brand")};

  ${ListItemName} {
    margin-left: 4px;
  }

  &:hover {
    color: ${darken("brand")};
  }
`;
