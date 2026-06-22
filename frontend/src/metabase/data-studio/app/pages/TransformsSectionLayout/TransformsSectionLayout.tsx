import type { ReactNode } from "react";
import type { WithRouterProps } from "react-router";
import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useSetting } from "metabase/common/hooks";
import { usePageTitle } from "metabase/hooks/use-page-title";
import { PLUGIN_TRANSFORMS } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { useTransformSupportedDbs } from "metabase/transforms/hooks/use-transform-supported-dbs";
import { EnableTransformsPage } from "metabase/transforms/pages/EnableTransformsPage/EnableTransformsPage";
import { NoWritableDatabasesEmptyState } from "metabase/transforms/pages/NoWritableDatabasesEmptyState";
import { getShouldShowTransformsUpsell } from "metabase/transforms/selectors";

import { SectionLayout } from "../../components/SectionLayout";

type TransformsSectionLayoutProps = WithRouterProps & {
  children?: ReactNode;
};

export function TransformsSectionLayout({
  children,
  params,
}: TransformsSectionLayoutProps) {
  usePageTitle(t`Transforms`, { titleIndex: 1 });
  const shouldShowUpsell = useSelector(getShouldShowTransformsUpsell);
  const isTransformsEnabled = useSetting("transforms-enabled");
  const isHosted = useSetting("is-hosted?");
  const { transformsDatabases, isLoadingDatabases, databasesError } =
    useTransformSupportedDbs();

  if (shouldShowUpsell) {
    return <PLUGIN_TRANSFORMS.TransformsUpsellPage />;
  } else if (!isTransformsEnabled && !isHosted) {
    return <EnableTransformsPage />;
  }

  // Transform-detail pages (`/data-studio/transforms/:transformId/...`) must remain reachable
  // even when no writable database exists, so the analyst can read the SQL/Python body of an
  // orphaned transform after its source DB has been deleted (GDGT-2447).
  const isTransformDetailRoute = Boolean(params?.transformId);

  if (
    !isLoadingDatabases &&
    transformsDatabases?.length === 0 &&
    !isTransformDetailRoute
  ) {
    return (
      <SectionLayout>
        <NoWritableDatabasesEmptyState />
      </SectionLayout>
    );
  }

  return (
    <SectionLayout>
      <LoadingAndErrorWrapper
        loading={isLoadingDatabases}
        error={databasesError}
        noWrapper
      >
        {children}
      </LoadingAndErrorWrapper>
    </SectionLayout>
  );
}
