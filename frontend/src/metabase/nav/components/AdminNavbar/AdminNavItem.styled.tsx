import styled from "styled-components";
import Link from "metabase/core/components/Link";
import { alpha, color } from "metabase/lib/colors";

interface AdminNavLinkProps {
  to: string;
  isSelected?: boolean;
}

export const AdminNavLink = styled<AdminNavLinkProps>(Link)`
  padding: 0.5rem 1rem;
  text-decoration: none;
  color: ${props => (props.isSelected ? color("white") : alpha("white", 0.63))};
`;
