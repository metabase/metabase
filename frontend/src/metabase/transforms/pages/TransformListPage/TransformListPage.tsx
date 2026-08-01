import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { DataStudioBreadcrumbs } from "metabase/common/data-studio/components/DataStudioBreadcrumbs";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { PaneHeader } from "metabase/common/data-studio/components/PaneHeader";
import { useSetting } from "metabase/common/hooks";
import CS from "metabase/css/core/index.css";
import { PLUGIN_REPLACEMENT } from "metabase/plugins";
import { Outlet, useRouter } from "metabase/router";
import { LockedTransformsBanner } from "metabase/transforms/components/LockedTransformsBanner/LockedTransformsBanner";
import {
  TransformTreeTable,
  useTransformTreeData,
} from "metabase/transforms/components/TransformTreeTable";
import { useTransformPermissions } from "metabase/transforms/hooks/use-transform-permissions";
import { Stack } from "metabase/ui";
import * as Urls from "metabase/urls";

import { CreateTransformMenu } from "./CreateTransformMenu";

export const TransformListPage = () => {
  const { location } = useRouter();
  const { transformsDatabases = [] } = useTransformPermissions();
  const targetCollectionId =
    Urls.extractEntityId(location.query?.collectionId) ?? null;
  const isMeterLocked = useSetting("transforms-meter-locked");

  const { nodes, transforms, isLoading, error } = useTransformTreeData(null, {
    includePythonLibrary: true,
  });

  if (error) {
    return <LoadingAndErrorWrapper loading={false} error={error} />;
  }

  return (
    <PageContainer data-testid="transforms-list" gap={0}>
      <PaneHeader
        breadcrumbs={
          <DataStudioBreadcrumbs>{t`Transforms`}</DataStudioBreadcrumbs>
        }
        showMetabotButton
        py={0}
      />
      <Stack className={CS.overflowHidden}>
        {isMeterLocked && <LockedTransformsBanner />}
        <TransformTreeTable
          nodes={nodes}
          transforms={transforms}
          isLoading={isLoading}
          targetCollectionId={targetCollectionId}
          actions={
            transformsDatabases.length > 0 && (
              <>
                <CreateTransformMenu />
                <PLUGIN_REPLACEMENT.TransformToolsMenu />
              </>
            )
          }
        />
      </Stack>
      <Outlet />
    </PageContainer>
  );
};
