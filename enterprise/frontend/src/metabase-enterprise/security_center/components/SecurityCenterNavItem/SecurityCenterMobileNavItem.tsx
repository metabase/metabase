import { t } from "ttag";

import { AdminNavLink } from "metabase/nav/components/AdminNavbar/AdminNavLink";
import { Flex } from "metabase/ui";
import * as Urls from "metabase/urls";

import { SecurityCenterBadge } from "./SecurityCenterBadge";

const PATH = Urls.securityCenter();

interface SecurityCenterMobileNavItemProps {
  currentPath: string;
}

export function SecurityCenterMobileNavItem({
  currentPath,
}: SecurityCenterMobileNavItemProps) {
  return (
    <AdminNavLink
      to={PATH}
      isSelected={currentPath.startsWith(PATH)}
      isInMobileNav
    >
      <Flex align="center" gap="0.375rem">
        {t`Security`}
        <SecurityCenterBadge />
      </Flex>
    </AdminNavLink>
  );
}
