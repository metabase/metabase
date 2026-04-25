import type { ReactNode } from "react";
import { t } from "ttag";

import { usePageTitle } from "metabase/hooks/use-page-title";

import { SectionLayout } from "../../components/SectionLayout";

type DependenciesSectionLayoutProps = {
  children?: ReactNode;
};

export function DependenciesSectionLayout({
  children,
}: DependenciesSectionLayoutProps) {
  usePageTitle(t`Dependency graph`);

  return <SectionLayout>{children}</SectionLayout>;
}
