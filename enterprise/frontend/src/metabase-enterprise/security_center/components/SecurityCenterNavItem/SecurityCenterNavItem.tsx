import { t } from "ttag";

import {
  AdminNavLink,
  AdminNavListItem,
} from "metabase/nav/components/AdminNavbar/AdminNavLink";
import { Flex } from "metabase/ui";
import * as Urls from "metabase/urls";

import { useSecurityCenterUrl } from "../../hooks/use-security-center-url";

import { SecurityCenterBadge } from "./SecurityCenterBadge";

const PATH = Urls.securityCenter();

interface SecurityCenterNavItemProps {
  currentPath: string;
}

export function SecurityCenterNavItem({
  currentPath,
}: SecurityCenterNavItemProps) {
  const url = useSecurityCenterUrl();

  return (
    <AdminNavListItem path={PATH} currentPath={currentPath}>
      <AdminNavLink to={url} isSelected={currentPath.startsWith(PATH)}>
        <Flex align="center" gap="0.375rem">
          {t`Security`}
          <SecurityCenterBadge />
        </Flex>
      </AdminNavLink>
    </AdminNavListItem>
  );
}
