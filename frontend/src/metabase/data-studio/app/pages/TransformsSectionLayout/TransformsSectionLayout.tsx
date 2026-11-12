import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { usePageTitle } from "metabase/hooks/use-page-title";
import { PLUGIN_TRANSFORMS } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { Outlet } from "metabase/router";
import { useSetting } from "metabase/settings";
import { useTransformSupportedDbs } from "metabase/transforms/hooks/use-transform-supported-dbs";
import { EnableTransformsPage } from "metabase/transforms/pages/EnableTransformsPage/EnableTransformsPage";
import { getShouldShowTransformsUpsell } from "metabase/transforms/selectors";

import { SectionLayout } from "../../components/SectionLayout";

import { NoWritableDatabasesEmptyState } from "./NoWritableDatabasesEmptyState";

export function TransformsSectionLayout() {
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

  if (!isLoadingDatabases && transformsDatabases?.length === 0) {
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
        <Outlet />
      </LoadingAndErrorWrapper>
    </SectionLayout>
  );
}
