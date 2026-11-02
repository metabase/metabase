import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { LoadingSkeleton } from "metabase/common/components/Skeletons";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import {
  CodeEditorSkeleton,
  PageSkeleton,
} from "metabase/common/data-studio/components/PageSkeleton";
import { usePageTitle } from "metabase/hooks/use-page-title";
import { PLUGIN_TRANSFORMS } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { Outlet, useParams } from "metabase/router";
import { useSetting } from "metabase/settings";
import { TransformsHeader } from "metabase/transforms/components/TransformsHeader";
import { useTransformSupportedDbs } from "metabase/transforms/hooks/use-transform-supported-dbs";
import { EnableTransformsPage } from "metabase/transforms/pages/EnableTransformsPage/EnableTransformsPage";
import { getShouldShowTransformsUpsell } from "metabase/transforms/selectors";
import { Card, Skeleton, TreeTableSkeleton } from "metabase/ui";

import { SectionLayout } from "../../components/SectionLayout";

import { NoWritableDatabasesEmptyState } from "./NoWritableDatabasesEmptyState";

const TRANSFORM_TAB_COUNT = 5;

export function TransformsSectionLayout() {
  const params = useParams();
  usePageTitle(t`Transforms`, { titleIndex: 1 });
  const shouldShowUpsell = useSelector(getShouldShowTransformsUpsell);
  const isTransformsSetupComplete = useSetting("transforms-setup-complete");
  const isHosted = useSetting("is-hosted?");
  const { transformsDatabases, isLoadingDatabases, databasesError } =
    useTransformSupportedDbs();

  if (shouldShowUpsell) {
    return <PLUGIN_TRANSFORMS.TransformsUpsellPage />;
  } else if (!isTransformsSetupComplete && !isHosted) {
    return <EnableTransformsPage />;
  }

  // Transform-detail pages (`/data-studio/transforms/:transformId/...`) must remain reachable
  // even when no writable database exists, so the analyst can read the SQL/Python body of an
  // orphaned transform after its source DB has been deleted (GDGT-2447).
  const isTransformDetailRoute = Boolean(params.transformId);

  if (isLoadingDatabases) {
    return (
      <SectionLayout>
        {isTransformDetailRoute ? (
          <PageSkeleton tabCount={TRANSFORM_TAB_COUNT}>
            <CodeEditorSkeleton withTopBar />
          </PageSkeleton>
        ) : (
          <TransformListSkeleton />
        )}
      </SectionLayout>
    );
  }

  if (transformsDatabases?.length === 0 && !isTransformDetailRoute) {
    return (
      <SectionLayout>
        <NoWritableDatabasesEmptyState />
      </SectionLayout>
    );
  }

  return (
    <SectionLayout>
      <LoadingAndErrorWrapper error={databasesError} noWrapper>
        <Outlet />
      </LoadingAndErrorWrapper>
    </SectionLayout>
  );
}

function TransformListSkeleton() {
  return (
    <PageContainer gap={0}>
      <TransformsHeader />
      <LoadingSkeleton>
        <Skeleton h={40} radius="sm" />
        <Card withBorder p={0}>
          <TreeTableSkeleton columnWidths={[0.35, 0.15, 0.15, 0.2, 0.05]} />
        </Card>
      </LoadingSkeleton>
    </PageContainer>
  );
}
