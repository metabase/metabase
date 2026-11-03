import { t } from "ttag";

import { AdminSettingsLayout } from "metabase/admin/components/AdminLayout/AdminSettingsLayout";
import {
  AdminNavItem,
  AdminNavWrapper,
} from "metabase/admin/components/AdminNav";
import { Outlet } from "metabase/router";
import * as Urls from "metabase/urls";

import { useSecurityIssues } from "../../hooks/use-security-issues";
import { IssueDot } from "../IssueDot/IssueDot";

const SecurityCenterNav = () => {
  const { hasAffectingAdvisory, hasFailingCheck } = useSecurityIssues();

  return (
    <AdminNavWrapper data-testid="security-center-nav">
      <AdminNavItem
        label={t`Advisories`}
        path={Urls.securityCenterAdvisories()}
        icon="shield_outline"
        rightSection={hasAffectingAdvisory && <IssueDot />}
      />
      <AdminNavItem
        label={t`Health checks`}
        path={Urls.securityCenterHealthChecks()}
        icon="pulse"
        rightSection={hasFailingCheck && <IssueDot />}
      />
    </AdminNavWrapper>
  );
};

export const SecurityCenterLayout = () => (
  <AdminSettingsLayout sidebar={<SecurityCenterNav />}>
    <Outlet />
  </AdminSettingsLayout>
);
