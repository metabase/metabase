import styled from "@emotion/styled";

import Link from "metabase/core/components/Link";
import { alpha, color } from "metabase/lib/colors";
import { breakpointMaxLarge } from "metabase/styled-components/theme";

const doNotForwardProps = (...propNamesToBlock: string[]) => ({
  shouldForwardProp: (propName: string) => !propNamesToBlock.includes(propName),
});

interface AdminNavLinkProps {
  to: string;
  isSelected?: boolean;
  isInMobileNav?: boolean;
}

export const AdminNavLink = styled(Link)<AdminNavLinkProps>`
  white-space: nowrap;
  ${props => (props.isInMobileNav ? "" : "overflow: hidden;")}
  text-overflow: ellipsis;
  padding: 0.5rem 1rem;
  text-decoration: none;
  ${breakpointMaxLarge} {
    padding-inline: 0.85rem;
  }

  color: ${props =>
    props.isSelected ? color("text-white") : alpha(color("text-white"), 0.63)};
`;

export const AdminNavListItem = styled(
  "li",
  doNotForwardProps("path", "currentPath"),
)<{ path: string; currentPath: string }>`
  display: inline-flex;
  flex-shrink: 1;
  white-space: nowrap;
  justify-content: center;
  min-width: ${props =>
    props.currentPath.startsWith(props.path) ? "fit-content" : "0px"};
`;
