import type { ReactNode } from "react";
import { t } from "ttag";

import {
  AdminNavItem,
  AdminNavWrapper,
} from "metabase/admin/components/AdminNav";
import { AdminSettingsLayout } from "metabase/common/components/AdminLayout/AdminSettingsLayout";
import {
  getRunsUrl,
  getTransformsUrl,
} from "metabase-enterprise/transforms/urls";

type TransformPageLayoutProps = {
  children?: ReactNode;
};

export function TransformPageLayout({ children }: TransformPageLayoutProps) {
  return (
    <AdminSettingsLayout sidebar={<TransformSidebar />} maw="60rem">
      {children}
    </AdminSettingsLayout>
  );
}

function TransformSidebar() {
  return (
    <AdminNavWrapper>
      <AdminNavItem
        label={t`Transforms`}
        path={getTransformsUrl()}
        icon="refresh_downstream"
      />
      <AdminNavItem label={t`Runs`} path={getRunsUrl()} icon="play_outlined" />
    </AdminNavWrapper>
  );
}
