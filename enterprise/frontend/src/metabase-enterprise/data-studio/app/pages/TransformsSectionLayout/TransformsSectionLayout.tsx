import type { Location } from "history";
import type { ReactNode } from "react";
import { t } from "ttag";

import { useHasTokenFeature } from "metabase/common/hooks";
import { usePageTitle } from "metabase/hooks/use-page-title";
import { useSelector } from "metabase/lib/redux";
import { getIsHosted } from "metabase/setup/selectors";

import { TransformsUpsellPage } from "../../../upsells";
import { SectionLayout } from "../../components/SectionLayout";

type TransformsSectionLayoutProps = {
  location: Location;
  children?: ReactNode;
};

export function TransformsSectionLayout({
  children,
}: TransformsSectionLayoutProps) {
  usePageTitle(t`Transforms`);
  const isHosted = useSelector(getIsHosted);
  const hasTransformsFeature = useHasTokenFeature("transforms");

  const shouldShowUpsell = isHosted && !hasTransformsFeature;

  if (shouldShowUpsell) {
    return <TransformsUpsellPage />;
  }

  return <SectionLayout>{children}</SectionLayout>;
}
