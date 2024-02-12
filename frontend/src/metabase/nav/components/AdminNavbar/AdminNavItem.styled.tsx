import styled from "@emotion/styled";

import Link from "metabase/core/components/Link";
import { alpha, color } from "metabase/lib/colors";

interface AdminNavLinkProps {
  to: string;
  isSelected?: boolean;
}

export const AdminNavLink = styled(Link)<AdminNavLinkProps>`
  padding: 0.5rem 1rem;
  text-decoration: none;
  color: ${props => (props.isSelected ? color("white") : alpha("white", 0.63))};
`;

export const ExternalNavLink = styled.span`
  padding: 0.5rem 1rem;
  text-decoration: none;
  color: ${alpha("white", 0.63)};
`;
