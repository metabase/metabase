import { Link } from "react-router-dom";
import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const TableSettingsLink = styled(Link)`
  &:hover {
    color: ${color("brand")};
  }
`;
