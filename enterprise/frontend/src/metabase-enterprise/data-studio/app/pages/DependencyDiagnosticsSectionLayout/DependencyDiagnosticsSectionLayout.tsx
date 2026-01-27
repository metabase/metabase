import type { ReactNode } from "react";
import { t } from "ttag";

import { useHasTokenFeature } from "metabase/common/hooks";
import { usePageTitle } from "metabase/hooks/use-page-title";
import { DependenciesUpsellPage } from "metabase-enterprise/data-studio/upsells";

import { SectionLayout } from "../../components/SectionLayout";

type DependencyDiagnosticsSectionLayoutProps = {
  children?: ReactNode;
};

export function DependencyDiagnosticsSectionLayout({
  children,
}: DependencyDiagnosticsSectionLayoutProps) {
  usePageTitle(t`Dependency diagnostics`);
  const hasDependenciesFeature = useHasTokenFeature("dependencies");

  if (!hasDependenciesFeature) {
    return <DependenciesUpsellPage />;
  }

  return <SectionLayout>{children}</SectionLayout>;
}
