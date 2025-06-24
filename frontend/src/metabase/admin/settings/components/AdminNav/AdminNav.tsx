import type React from "react";

import Link from "metabase/core/components/Link";
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
  stackProps?: StackProps;
}) => {
  return (
    <Stack w="16rem" gap="xs" bg="white" p="md" h="100%" {...stackProps}>
      {children}
    </Stack>
  );
};

export type AdminNavItemProps = {
  path: string;
  icon?: IconName;
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
      {...(icon ? { leftSection: <Icon name={icon} /> } : undefined)}
      {...navLinkProps}
    />
  );
}
