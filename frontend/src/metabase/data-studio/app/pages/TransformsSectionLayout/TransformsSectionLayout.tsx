import type { Location } from "history";
import type { ReactNode } from "react";
import { t } from "ttag";

import { useHasTokenFeature, useSetting } from "metabase/common/hooks";
import { usePageTitle } from "metabase/hooks/use-page-title";
import { useSelector } from "metabase/lib/redux";
import { PLUGIN_TRANSFORMS } from "metabase/plugins";
import { EnableTransformsPage } from "metabase/transforms/pages/EnableTransformsPage/EnableTransformsPage";
import { getShouldShowTransformsUpsell } from "metabase/transforms/selectors";

import { SectionLayout } from "../../components/SectionLayout";

type TransformsSectionLayoutProps = {
  children?: ReactNode;
};

export function TransformsSectionLayout({
  children,
}: TransformsSectionLayoutProps) {
  usePageTitle(t`Transforms`);
  const shouldShowUpsell = useSelector(getShouldShowTransformsUpsell);
  const isTransformsEnabled = useSetting("transforms-enabled");
  const isHosted = useHasTokenFeature("hosting");

  if (shouldShowUpsell) {
    return <PLUGIN_TRANSFORMS.TransformsUpsellPage />;
  } else if (!isTransformsEnabled && !isHosted) {
    return <EnableTransformsPage />;
  }

  return <SectionLayout>{children}</SectionLayout>;
}
