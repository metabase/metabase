import type { ReactNode } from "react";

import { Link } from "metabase/common/components/Link";
import { Box, Flex } from "metabase/ui";

import S from "./AdminNavbar.module.css";

interface AdminNavLinkProps {
  to: string;
  isSelected?: boolean;
  isInMobileNav?: boolean;
  children?: ReactNode;
}

export const AdminNavLink = ({
  to,
  isSelected,
  isInMobileNav,
  children,
}: AdminNavLinkProps) => (
  <Box
    component={Link}
    to={to}
    className={S.AdminNavLink}
    data-selected={isSelected || undefined}
    bg={isSelected ? "admin-navbar-inverse" : undefined}
    style={{ overflow: isInMobileNav ? "visible" : "hidden" }}
  >
    {children}
  </Box>
);

interface AdminNavListItemProps {
  path: string;
  currentPath: string;
  children?: ReactNode;
}

export const AdminNavListItem = ({
  path,
  currentPath,
  children,
}: AdminNavListItemProps) => (
  <Flex
    component="li"
    display="inline-flex"
    justify="center"
    miw={currentPath.startsWith(path) ? "fit-content" : 0}
    style={{ whiteSpace: "nowrap" }}
  >
    {children}
  </Flex>
);
