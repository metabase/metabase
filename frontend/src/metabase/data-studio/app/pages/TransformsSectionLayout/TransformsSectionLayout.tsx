import type { Location } from "history";
import type { ReactNode } from "react";
import { t } from "ttag";

import { usePageTitle } from "metabase/hooks/use-page-title";
import { useSelector } from "metabase/lib/redux";
import { PLUGIN_TRANSFORMS } from "metabase/plugins";
import { getShouldShowTransformsUpsell } from "metabase/transforms/selectors";

import { SectionLayout } from "../../components/SectionLayout";

type TransformsSectionLayoutProps = {
  location: Location;
  children?: ReactNode;
};

export function TransformsSectionLayout({
  children,
}: TransformsSectionLayoutProps) {
  usePageTitle(t`Transforms`);
  const shouldShowUpsell = useSelector(getShouldShowTransformsUpsell);

  if (shouldShowUpsell) {
    return <PLUGIN_TRANSFORMS.TransformsUpsellPage />;
  }

  return <SectionLayout>{children}</SectionLayout>;
}
