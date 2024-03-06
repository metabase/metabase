import { Link } from "react-router";
import styled from "@emotion/styled";
import { color } from "metabase/ui/utils/colors";

export const TableSettingsLink = styled(Link)`
  &:hover {
    color: ${color("brand")};
  }
`;
