import styled from "@emotion/styled";

import Link from "metabase/core/components/Link";
import { alpha, color } from "metabase/lib/colors";

interface AdminNavLinkProps {
  to: string;
  isSelected?: boolean;
}

export const AdminNavLink = styled(Link)<AdminNavLinkProps>`
  display: block;
  text-decoration: none;
  color: ${props =>
    props.isSelected ? color("text-white") : alpha("text-white", 0.63)};
`;
