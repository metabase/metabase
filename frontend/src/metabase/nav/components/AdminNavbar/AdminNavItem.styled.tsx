// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { doNotForwardProps } from "metabase/common/utils/doNotForwardProps";
import Link from "metabase/core/components/Link";
import { color, darken } from "metabase/lib/colors";
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
      ? "var(--mb-color-text-white)"
      : "color-mix(in srgb, var(--mb-color-text-white), transparent 35%)"};
  background-color: ${(props) =>
    props.isSelected ? darken(color("filter")) : "transparent"};

  &:hover {
    color: var(--mb-color-text-white);
    background-color: ${() => darken(color("filter"))};
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
