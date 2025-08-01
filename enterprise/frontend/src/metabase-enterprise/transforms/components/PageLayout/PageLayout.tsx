import type { ReactNode } from "react";
import { t } from "ttag";

import {
  AdminNavItem,
  AdminNavWrapper,
} from "metabase/admin/components/AdminNav";
import { AdminSettingsLayout } from "metabase/common/components/AdminLayout/AdminSettingsLayout";

import { getNewTransformPageUrl, getOverviewPageUrl } from "../../urls";

type PageLayoutProps = {
  children: ReactNode;
};

export function PageLayout({ children }: PageLayoutProps) {
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
        path={getNewTransformPageUrl()}
        icon="refresh_downstream"
      />
    </AdminNavWrapper>
  );
}
