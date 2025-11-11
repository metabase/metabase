import type { ReactNode } from "react";
import { t } from "ttag";

import { SectionLayout, SectionTitle } from "../../components/SectionLayout";

type DependenciesSectionLayoutProps = {
  children?: ReactNode;
};

export function DependenciesSectionLayout({
  children,
}: DependenciesSectionLayoutProps) {
  return (
    <SectionLayout title={<SectionTitle title={t`Dependency graph`} />}>
      {children}
    </SectionLayout>
  );
}
