import styled from "@emotion/styled";
import { Link } from "react-router";

import { color } from "metabase/lib/colors";

export const TableSettingsLink = styled(Link)`
  &:hover {
    color: ${color("brand")};
  }
`;
