import { t } from "ttag";

import { AdminSettingsLayout } from "metabase/admin/components/AdminLayout/AdminSettingsLayout";
import {
  AdminNavItem,
  AdminNavWrapper,
} from "metabase/admin/components/AdminNav";
import { Outlet } from "metabase/router";
import * as Urls from "metabase/urls";

const SecurityCenterNav = () => (
  <AdminNavWrapper>
    <AdminNavItem
      label={t`Advisories`}
      path={Urls.securityCenterAdvisories()}
      icon="shield_outline"
    />
    <AdminNavItem
      label={t`Health checks`}
      path={Urls.securityCenterHealthChecks()}
      icon="pulse"
    />
  </AdminNavWrapper>
);

export const SecurityCenterLayout = () => (
  <AdminSettingsLayout sidebar={<SecurityCenterNav />}>
    <Outlet />
  </AdminSettingsLayout>
);
