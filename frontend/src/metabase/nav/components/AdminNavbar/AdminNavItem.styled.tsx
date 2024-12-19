import styled from "@emotion/styled";

import { doNotForwardProps } from "metabase/common/utils/doNotForwardProps";
import Link from "metabase/core/components/Link";
import { breakpointMaxLarge } from "metabase/styled-components/theme";

interface AdminNavLinkProps {
  to: string;
  isSelected?: boolean;
  isInMobileNav?: boolean;
}

export const AdminNavLink = styled(
  Link,
  doNotForwardProps("isSelected", "isInMobileNav"),
)<AdminNavLinkProps>`
  white-space: nowrap;
  ${props => (props.isInMobileNav ? "" : "overflow: hidden;")}
  text-overflow: ellipsis;
  padding: 0.5rem 1rem;
  ${breakpointMaxLarge} {
    padding-inline: 0.85rem;
  }

  color: ${props =>
    props.isSelected
      ? "var(--mb-color-text-white)"
      : "color-mix(in srgb, var(--mb-color-text-white), transparent 37%)"};
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
