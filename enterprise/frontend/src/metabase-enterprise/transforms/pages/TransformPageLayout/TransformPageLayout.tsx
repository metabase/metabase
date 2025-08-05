import type { ReactNode } from "react";
import { t } from "ttag";

import {
  AdminNavItem,
  AdminNavWrapper,
} from "metabase/admin/components/AdminNav";
import { AdminSettingsLayout } from "metabase/common/components/AdminLayout/AdminSettingsLayout";
import * as Urls from "metabase/lib/urls";
import { useListTransformsQuery } from "metabase-enterprise/api";
import {
  getOverviewUrl,
  getRunsUrl,
  getnewTransformUrl,
} from "metabase-enterprise/transforms/urls";
import type { TransformId } from "metabase-types/api";

import { TransformList } from "./TransformList";

type TransformPageLayoutParams = {
  transformId?: string;
};

type TransformPageLayoutParsedParams = {
  transformId?: TransformId;
};

type TransformPageLayoutProps = {
  params: TransformPageLayoutParams;
  children?: ReactNode;
};

export function TransformPageLayout({
  params,
  children,
}: TransformPageLayoutProps) {
  const { transformId } = getParsedParams(params);

  return (
    <AdminSettingsLayout
      sidebar={<TransformSidebar transformId={transformId} />}
      maw="60rem"
    >
      {children}
    </AdminSettingsLayout>
  );
}

type TransformSidebarProps = {
  transformId?: TransformId;
};

function TransformSidebar({ transformId }: TransformSidebarProps) {
  const { data: transforms = [] } = useListTransformsQuery();

  return (
    <AdminNavWrapper>
      <AdminNavItem label={t`Overview`} path={getOverviewUrl()} icon="home" />
      {transforms.length > 0 ? (
        <TransformList transforms={transforms} transformId={transformId} />
      ) : (
        <AdminNavItem
          label={t`Transforms`}
          path={getnewTransformUrl()}
          icon="refresh_downstream"
        />
      )}
      <AdminNavItem label={t`Runs`} path={getRunsUrl()} icon="play_outlined" />
    </AdminNavWrapper>
  );
}

function getParsedParams({
  transformId,
}: TransformPageLayoutParams): TransformPageLayoutParsedParams {
  return {
    transformId: Urls.extractEntityId(transformId),
  };
}
