import type { ReactNode } from "react";
import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import { usePageTitle } from "metabase/hooks/use-page-title";
import { PLUGIN_TRANSFORMS } from "metabase/plugins";
import { useTransformSupportedDbs } from "metabase/transforms/hooks/use-transform-supported-dbs";
import { EnableTransformsPage } from "metabase/transforms/pages/EnableTransformsPage/EnableTransformsPage";
import { NoWritableDatabasesEmptyState } from "metabase/transforms/pages/NoWritableDatabasesEmptyState";
import { getShouldShowTransformsUpsell } from "metabase/transforms/selectors";
import { useSelector } from "metabase/utils/redux";

import { SectionLayout } from "../../components/SectionLayout";

type TransformsSectionLayoutProps = {
  children?: ReactNode;
};

export function TransformsSectionLayout({
  children,
}: TransformsSectionLayoutProps) {
  usePageTitle(t`Transforms`, { titleIndex: 1 });
  const shouldShowUpsell = useSelector(getShouldShowTransformsUpsell);
  const isTransformsEnabled = useSetting("transforms-enabled");
  const isHosted = useSetting("is-hosted?");
  const { transformsDatabases, isLoadingDatabases } =
    useTransformSupportedDbs();

  if (shouldShowUpsell) {
    return <PLUGIN_TRANSFORMS.TransformsUpsellPage />;
  } else if (!isTransformsEnabled && !isHosted) {
    return <EnableTransformsPage />;
  }

  if (!isLoadingDatabases && transformsDatabases?.length === 0) {
    return (
      <SectionLayout>
        <NoWritableDatabasesEmptyState />
      </SectionLayout>
    );
  }

  return <SectionLayout>{children}</SectionLayout>;
}
