import { t } from "ttag";

import { useListSecurityAdvisoriesQuery } from "metabase/api";
import {
  AdminNavLink,
  AdminNavListItem,
} from "metabase/nav/components/AdminNavbar/AdminNavItem.styled";
import { Box, Flex } from "metabase/ui";

import { isAffected } from "../../utils";

const PATH = "/admin/security-center";

interface SecurityCenterNavItemProps {
  currentPath: string;
}

export function SecurityCenterNavItem({
  currentPath,
}: SecurityCenterNavItemProps) {
  const { data: advisoriesResponse } = useListSecurityAdvisoriesQuery();
  const advisories = advisoriesResponse?.advisories ?? [];
  const hasActive = advisories.some(isAffected);

  return (
    <AdminNavListItem path={PATH} currentPath={currentPath}>
      <AdminNavLink to={PATH} isSelected={currentPath.startsWith(PATH)}>
        <Flex align="center" gap="0.375rem">
          {t`Security`}
          {hasActive && (
            <Box
              w={8}
              h={8}
              miw={8}
              bg="error"
              style={{ borderRadius: "50%", flexShrink: 0 }}
              data-testid="security-center-badge"
            />
          )}
        </Flex>
      </AdminNavLink>
    </AdminNavListItem>
  );
}
