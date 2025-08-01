import type { ReactNode } from "react";
import { t } from "ttag";

import {
  AdminNavItem,
  AdminNavWrapper,
} from "metabase/admin/components/AdminNav";
import { AdminSettingsLayout } from "metabase/common/components/AdminLayout/AdminSettingsLayout";
import { useListTransformsQuery } from "metabase-enterprise/api";
import {
  getOverviewPageUrl,
  getnewTransformPageUrl,
} from "metabase-enterprise/transforms/urls";

import { TransformList } from "./TransformList";

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
  const { data: transforms = [] } = useListTransformsQuery();

  return (
    <AdminNavWrapper>
      <AdminNavItem
        label={t`Overview`}
        path={getOverviewPageUrl()}
        icon="home"
      />
      {transforms.length > 0 ? (
        <TransformList transforms={transforms} />
      ) : (
        <AdminNavItem
          label={t`Transforms`}
          path={getnewTransformPageUrl()}
          icon="refresh_downstream"
        />
      )}
    </AdminNavWrapper>
  );
}
