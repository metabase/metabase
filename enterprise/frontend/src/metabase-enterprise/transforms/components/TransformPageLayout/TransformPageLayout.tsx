import type { ReactNode } from "react";
import { t } from "ttag";

import {
  AdminNavItem,
  AdminNavWrapper,
} from "metabase/admin/components/AdminNav";
import { AdminSettingsLayout } from "metabase/common/components/AdminLayout/AdminSettingsLayout";

import { getNewTransformPageUrl, getTransformRootPageUrl } from "../../urls";

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
        path={getTransformRootPageUrl()}
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
