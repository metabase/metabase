import type { ReactNode } from "react";
import type { RouteProps } from "react-router";
import { t } from "ttag";

import {
  AdminNavItem,
  AdminNavWrapper,
} from "metabase/admin/components/AdminNav";
import { AdminSettingsLayout } from "metabase/common/components/AdminLayout/AdminSettingsLayout";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_TRANSFORMS_PYTHON } from "metabase/plugins";
import { getLocation } from "metabase/selectors/routing";

type TransformPageLayoutPropsParams = {
  transformId?: string;
  jobId?: string;
};

type TransformPageLayoutProps = {
  params: TransformPageLayoutPropsParams;
  children?: ReactNode;
} & { route?: RouteProps<{ fullWidth?: boolean }> };

type TransformPageLayoutOwnProps = TransformPageLayoutProps & {
  maw?: string;
  fullWidth?: boolean;
};

export function ListPageLayout({ params, children }: TransformPageLayoutProps) {
  return (
    <TransformPageLayout params={params} maw="100rem">
      {children}
    </TransformPageLayout>
  );
}

export function DetailsPageLayout({
  params,
  children,
  route,
}: TransformPageLayoutProps) {
  return (
    <TransformPageLayout params={params} maw="60rem" {...route?.props}>
      {children}
    </TransformPageLayout>
  );
}

function TransformPageLayout({
  params,
  maw,
  fullWidth,
  children,
}: TransformPageLayoutOwnProps) {
  return (
    <AdminSettingsLayout
      sidebar={<TransformPageSidebar params={params} />}
      maw={maw}
      fullWidth={fullWidth}
    >
      {children}
    </AdminSettingsLayout>
  );
}

export function FullWidthTransformPageLayout(props: TransformPageLayoutProps) {
  return <TransformPageLayout {...props} fullWidth />;
}

type TransformPageSidebarProps = {
  params: TransformPageLayoutPropsParams;
};

function TransformPageSidebar({ params }: TransformPageSidebarProps) {
  const { transformId, jobId } = params;
  const location = useSelector(getLocation);
  const pathname = location?.pathname;
  const transformListUrl = Urls.transformList();
  const jobListUrl = Urls.transformJobList();
  const runListUrl = Urls.transformRunList();

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
        active={pathname === jobListUrl || jobId != null}
      />
      <AdminNavItem
        label={t`Runs`}
        path={runListUrl}
        icon="list"
        active={pathname === runListUrl}
      />
      {PLUGIN_TRANSFORMS_PYTHON.getTransformsNavLinks()}
    </AdminNavWrapper>
  );
}
