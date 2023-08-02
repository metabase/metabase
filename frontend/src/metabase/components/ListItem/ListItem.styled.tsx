import { Link } from "react-router";
import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const ListItemLink = styled(Link)`
  &:hover {
    color: ${color("brand")};
  }
`;
