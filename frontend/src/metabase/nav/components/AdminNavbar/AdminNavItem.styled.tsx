import styled from "@emotion/styled";

import { doNotForwardProps } from "metabase/common/utils/doNotForwardProps";
import Link from "metabase/core/components/Link";
import { breakpointMaxLarge } from "metabase/styled-components/theme";

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
  ${breakpointMaxLarge} {
    padding-inline: 0.85rem;
  }

  color: ${props =>
    props.isSelected
      ? "var(--mb-color-brand)"
      : "var(--mb-color-text-dark)"};

  border-radius: 0.5rem;

  background-color: ${props =>
    props.isSelected
      ? "color-mix(in srgb, var(--mb-color-brand) 20%, white 80%)"
      : "transparent"};
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
