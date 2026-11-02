import { t } from "ttag";

import {
  AdminNavLink,
  AdminNavListItem,
} from "metabase/nav/components/AdminNavbar/AdminNavLink";
import { Flex } from "metabase/ui";

import { SecurityCenterBadge } from "./SecurityCenterBadge";

const PATH = "/admin/security-center";

interface SecurityCenterNavItemProps {
  currentPath: string;
}

export function SecurityCenterNavItem({
  currentPath,
}: SecurityCenterNavItemProps) {
  return (
    <AdminNavListItem path={PATH} currentPath={currentPath}>
      <AdminNavLink to={PATH} isSelected={currentPath.startsWith(PATH)}>
        <Flex align="center" gap="0.375rem">
          {t`Security`}
          <SecurityCenterBadge />
        </Flex>
      </AdminNavLink>
    </AdminNavListItem>
  );
}
