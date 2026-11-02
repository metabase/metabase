import { t } from "ttag";

import { AdminSettingsLayout } from "metabase/admin/components/AdminLayout/AdminSettingsLayout";
import {
  AdminNavItem,
  AdminNavWrapper,
} from "metabase/admin/components/AdminNav";
import { Outlet } from "metabase/router";

const SecurityCenterNav = () => (
  <AdminNavWrapper>
    <AdminNavItem
      label={t`Advisories`}
      path="/admin/security-center/advisories"
      icon="shield_outline"
    />
    <AdminNavItem
      label={t`Health checks`}
      path="/admin/security-center/health-checks"
      icon="check_filled"
    />
  </AdminNavWrapper>
);

export const SecurityCenterLayout = () => (
  <AdminSettingsLayout sidebar={<SecurityCenterNav />}>
    <Outlet />
  </AdminSettingsLayout>
);
