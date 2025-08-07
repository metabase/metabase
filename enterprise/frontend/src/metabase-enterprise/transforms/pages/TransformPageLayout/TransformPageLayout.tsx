import type { ReactNode } from "react";
import { t } from "ttag";

import {
  AdminNavItem,
  AdminNavWrapper,
} from "metabase/admin/components/AdminNav";
import { AdminSettingsLayout } from "metabase/common/components/AdminLayout/AdminSettingsLayout";

import { getJobListUrl, getRunListUrl, getTransformListUrl } from "../../urls";

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
        path={getTransformListUrl()}
        icon="refresh_downstream"
      />
      <AdminNavItem
        label={t`Jobs`}
        path={getJobListUrl()}
        icon="play_outlined"
      />
      <AdminNavItem label={t`Runs`} path={getRunListUrl()} icon="list" />
    </AdminNavWrapper>
  );
}
