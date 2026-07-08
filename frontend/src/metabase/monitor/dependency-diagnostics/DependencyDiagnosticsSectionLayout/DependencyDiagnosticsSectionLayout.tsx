import type { ReactNode } from "react";
import { t } from "ttag";

import { SectionLayout } from "metabase/data-studio/app/components/SectionLayout";
import { usePageTitle } from "metabase/hooks/use-page-title";

type DependencyDiagnosticsSectionLayoutProps = {
  children?: ReactNode;
};

export function DependencyDiagnosticsSectionLayout({
  children,
}: DependencyDiagnosticsSectionLayoutProps) {
  usePageTitle(t`Dependency diagnostics`);

  return <SectionLayout>{children}</SectionLayout>;
}
