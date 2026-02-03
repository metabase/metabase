import type { ReactNode } from "react";
import { t } from "ttag";

import { usePageTitle } from "metabase/hooks/use-page-title";

import { SectionLayout } from "../../components/SectionLayout";

type DependencyDiagnosticsSectionLayoutProps = {
  children?: ReactNode;
};

export function DependencyDiagnosticsSectionLayout({
  children,
}: DependencyDiagnosticsSectionLayoutProps) {
  usePageTitle(t`Dependency diagnostics`);

  return <SectionLayout>{children}</SectionLayout>;
}
