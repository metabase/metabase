import type { ReactNode } from "react";
import { t } from "ttag";

import {
  AdminNavItem,
  AdminNavWrapper,
} from "metabase/admin/components/AdminNav";
import { AdminSettingsLayout } from "metabase/common/components/AdminLayout/AdminSettingsLayout";

import { getJobListUrl, getRunListUrl, getTransformListUrl } from "../../urls";

type TransformPageLayoutParams = {
  transformId?: string;
  jobId?: string;
};

type TransformPageLayoutProps = {
  params: TransformPageLayoutParams;
  children?: ReactNode;
};

export function TransformPageLayout({
  params,
  children,
}: TransformPageLayoutProps) {
  return (
    <AdminSettingsLayout
      sidebar={<TransformSidebar params={params} />}
      maw="60rem"
    >
      {children}
    </AdminSettingsLayout>
  );
}

type TransformSidebarProps = {
  params: TransformPageLayoutParams;
};

function TransformSidebar({ params }: TransformSidebarProps) {
  const { transformId, jobId } = params;

  return (
    <AdminNavWrapper>
      <AdminNavItem
        label={t`Transforms`}
        path={getTransformListUrl()}
        icon="refresh_downstream"
        {...(transformId != null ? { active: true } : {})}
      />
      <AdminNavItem
        label={t`Jobs`}
        path={getJobListUrl()}
        icon="play_outlined"
        {...(jobId != null ? { active: true } : {})}
      />
      <AdminNavItem label={t`Runs`} path={getRunListUrl()} icon="list" />
    </AdminNavWrapper>
  );
}
