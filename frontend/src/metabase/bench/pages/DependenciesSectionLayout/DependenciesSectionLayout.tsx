import type { ReactNode } from "react";
import { t } from "ttag";

import {
  BenchSectionLayout,
  BenchSectionTitle,
} from "../../components/BenchSectionLayout";

type DependenciesSectionLayoutProps = {
  children?: ReactNode;
};

export function DependenciesSectionLayout({
  children,
}: DependenciesSectionLayoutProps) {
  return (
    <BenchSectionLayout
      title={<BenchSectionTitle title={t`Dependency graph`} />}
    >
      {children}
    </BenchSectionLayout>
  );
}
