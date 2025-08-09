import type React from "react";

import Link from "metabase/common/components/Link";
import { useSelector } from "metabase/lib/redux";
import { getLocation } from "metabase/selectors/routing";
import {
  Icon,
  type IconName,
  NavLink,
  type NavLinkProps,
  Stack,
  type StackProps,
} from "metabase/ui";

export const AdminNavWrapper = ({
  children,
  ...stackProps
}: {
  children: React.ReactNode;
} & StackProps) => {
  return (
    <Stack
      w="16rem"
      gap={0}
      bg="white"
      p="md"
      h="100%"
      {...stackProps}
      component="nav"
    >
      {children}
    </Stack>
  );
};

export type AdminNavItemProps = {
  path: string;
  icon?: IconName;
  onClick?: () => void;
} & Omit<NavLinkProps, "href">;

export function AdminNavItem({
  path,
  label,
  icon,
  ...navLinkProps
}: AdminNavItemProps) {
  const location = useSelector(getLocation);
  const subpath = location?.pathname;

  return (
    <NavLink
      component={Link}
      to={path}
      defaultOpened={subpath.includes(path)}
      active={path === subpath}
      variant="admin-nav"
      label={label}
      mb="xs"
      {...(icon ? { leftSection: <Icon name={icon} /> } : undefined)}
      {...navLinkProps}
    />
  );
}
