import type { ReactNode } from "react";
import { t } from "ttag";

import {
  AdminNavItem,
  AdminNavWrapper,
} from "metabase/admin/components/AdminNav";
import { AdminSettingsLayout } from "metabase/common/components/AdminLayout/AdminSettingsLayout";
import {
  getOverviewPageUrl,
  getnewTransformPageUrl,
} from "metabase-enterprise/transforms/urls";

type TransformPageLayoutProps = {
  children: ReactNode;
};

export function TransformPageLayout({ children }: TransformPageLayoutProps) {
  return (
    <AdminSettingsLayout sidebar={<Sidebar />} maw="60rem">
      {children}
    </AdminSettingsLayout>
  );
}

function Sidebar() {
  return (
    <AdminNavWrapper>
      <AdminNavItem
        label={t`Overview`}
        path={getOverviewPageUrl()}
        icon="home"
      />
      <AdminNavItem
        label={t`Transforms`}
        path={getnewTransformPageUrl()}
        icon="refresh_downstream"
      />
    </AdminNavWrapper>
  );
}
