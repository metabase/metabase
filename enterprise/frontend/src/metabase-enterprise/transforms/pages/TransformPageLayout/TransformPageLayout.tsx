import type { ReactNode } from "react";
import { t } from "ttag";

import {
  AdminNavItem,
  AdminNavWrapper,
} from "metabase/admin/components/AdminNav";
import { AdminSettingsLayout } from "metabase/common/components/AdminLayout/AdminSettingsLayout";
import { useSelector } from "metabase/lib/redux";
import { PLUGIN_TRANSFORMS_PYTHON } from "metabase/plugins";
import { getLocation } from "metabase/selectors/routing";

import { getJobListUrl, getRunListUrl, getTransformListUrl } from "../../urls";

type TransformPageLayoutParams = {
  transformId?: string;
  jobId?: string;
};

type TransformPageLayoutProps = {
  params: TransformPageLayoutParams;
  fullWidth?: boolean;
  children?: ReactNode;
};

export function TransformPageLayout({
  params,
  children,
  fullWidth,
}: TransformPageLayoutProps) {
  return (
    <AdminSettingsLayout
      sidebar={<TransformSidebar params={params} />}
      maw="60rem"
      fullWidth={fullWidth}
    >
      {children}
    </AdminSettingsLayout>
  );
}

export function FullWidthTransformPageLayout(props: TransformPageLayoutProps) {
  return <TransformPageLayout {...props} fullWidth />;
}

type TransformSidebarProps = {
  params: TransformPageLayoutParams;
};

function TransformSidebar({ params }: TransformSidebarProps) {
  const { transformId } = params;
  const location = useSelector(getLocation);
  const pathname = location?.pathname;
  const transformListUrl = getTransformListUrl();
  const jobListUrl = getJobListUrl();

  return (
    <AdminNavWrapper data-testid="transform-sidebar">
      <AdminNavItem
        label={t`Transforms`}
        path={transformListUrl}
        icon="refresh_downstream"
        active={pathname === transformListUrl || transformId != null}
      />
      <AdminNavItem
        label={t`Jobs`}
        path={jobListUrl}
        icon="play_outlined"
        active={pathname?.startsWith(jobListUrl)}
      />
      <AdminNavItem label={t`Runs`} path={getRunListUrl()} icon="list" />
      {PLUGIN_TRANSFORMS_PYTHON.getTransformsNavLinks()}
    </AdminNavWrapper>
  );
}
