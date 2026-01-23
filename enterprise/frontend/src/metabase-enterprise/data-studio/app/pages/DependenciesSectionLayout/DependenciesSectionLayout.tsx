import type { ReactNode } from "react";
import { t } from "ttag";

import { useHasTokenFeature } from "metabase/common/hooks";
import { usePageTitle } from "metabase/hooks/use-page-title";
import { DependenciesUpsellPage } from "metabase-enterprise/data-studio/upsells";

import { SectionLayout } from "../../components/SectionLayout";

type DependenciesSectionLayoutProps = {
  children?: ReactNode;
};

export function DependenciesSectionLayout({
  children,
}: DependenciesSectionLayoutProps) {
  usePageTitle(t`Dependency graph`);
  const hasDependenciesFeature = useHasTokenFeature("dependencies");

  if (!hasDependenciesFeature) {
    return <DependenciesUpsellPage />;
  }

  return <SectionLayout>{children}</SectionLayout>;
}
