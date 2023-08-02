import { Link } from "react-router";
import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Ellipsified from "metabase/core/components/Ellipsified";

export const ListItemLink = styled(Link)`
  &:hover {
    color: ${color("brand")};
  }
`;

export const ListItemName = styled(Ellipsified)`
  max-width: 100%;
  overflow: hidden;

  &:hover {
    color: ${color("brand")};
  }
`;
