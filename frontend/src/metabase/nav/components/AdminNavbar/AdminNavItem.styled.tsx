// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import Link from "metabase/common/components/Link";
import { doNotForwardProps } from "metabase/common/utils/doNotForwardProps";
import { darken } from "metabase/lib/colors";
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
  ${(props) => (props.isInMobileNav ? "" : "overflow: hidden;")}
  text-overflow: ellipsis;
  padding: 0.5rem 1rem;
  ${breakpointMaxLarge} {
    padding-inline: 0.85rem;
  }

  transition: all 200ms;
  border-radius: 4px;
  color: ${(props) =>
    props.isSelected
      ? "var(--mb-color-text-primary-inverse)"
      : "color-mix(in srgb, var(--mb-color-text-primary-inverse), transparent 35%)"};
  background-color: ${(props) =>
    props.isSelected ? darken("admin-navbar") : "transparent"};

  &:hover {
    color: var(--mb-color-text-primary-inverse);
    background-color: ${() => darken("admin-navbar")};
  }
`;

export const AdminNavListItem = styled(
  "li",
  doNotForwardProps("path", "currentPath"),
)<{ path: string; currentPath: string }>`
  display: inline-flex;
  flex-shrink: 1;
  white-space: nowrap;
  justify-content: center;
  min-width: ${(props) =>
    props.currentPath.startsWith(props.path) ? "fit-content" : "0px"};
`;
