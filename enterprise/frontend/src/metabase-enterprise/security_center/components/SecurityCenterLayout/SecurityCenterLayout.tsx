import { t } from "ttag";

import { AdminSettingsLayout } from "metabase/admin/components/AdminLayout/AdminSettingsLayout";
import {
  AdminNavItem,
  AdminNavWrapper,
} from "metabase/admin/components/AdminNav";
import { Navigate, Outlet, useLocation } from "metabase/router";
import { Stack } from "metabase/ui";
import type { IconName } from "metabase-types/api";

import { useListSecurityAdvisoriesQuery } from "../../api";
import { getTargetUpgradeVersion } from "../../utils";
import { UpgradeBanner } from "../UpgradeBanner/UpgradeBanner";

type SecurityCenterSection = {
  label: string;
  path: string;
  icon: IconName;
};

const useSecurityCenterSections = (): SecurityCenterSection[] => [
  {
    label: t`Advisories`,
    path: "/admin/security-center/advisories",
    icon: "shield_outline",
  },
  {
    label: t`Health checks`,
    path: "/admin/security-center/health-checks",
    icon: "check_filled",
  },
];

export const SecurityCenterLayout = () => {
  const sections = useSecurityCenterSections();
  const location = useLocation();
  const { data: advisoriesResponse } = useListSecurityAdvisoriesQuery();
  const targetVersion = getTargetUpgradeVersion(
    advisoriesResponse?.advisories ?? [],
  );
  const isOnSection = sections.some((section) =>
    location.pathname.startsWith(section.path),
  );

  if (!isOnSection && sections.length > 0) {
    return (
      <Navigate
        to={{ pathname: sections[0].path, search: location.search }}
        replace
      />
    );
  }

  return (
    <AdminSettingsLayout
      sidebar={
        sections.length > 1 && (
          <AdminNavWrapper>
            {sections.map((section) => (
              <AdminNavItem
                key={section.path}
                label={section.label}
                path={section.path}
                icon={section.icon}
              />
            ))}
          </AdminNavWrapper>
        )
      }
    >
      <Stack gap="xl">
        <UpgradeBanner targetVersion={targetVersion} />
        <Outlet />
      </Stack>
    </AdminSettingsLayout>
  );
};
