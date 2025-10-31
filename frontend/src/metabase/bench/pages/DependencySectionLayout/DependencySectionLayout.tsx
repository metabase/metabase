import type { ReactNode } from "react";
import { t } from "ttag";

import {
  BenchSectionLayout,
  BenchSectionTitle,
} from "../../components/BenchSectionLayout";

type DependencySectionLayoutProps = {
  children?: ReactNode;
};

export function DependencySectionLayout({
  children,
}: DependencySectionLayoutProps) {
  return (
    <BenchSectionLayout
      title={<BenchSectionTitle title={t`Dependency graph`} />}
    >
      {children}
    </BenchSectionLayout>
  );
}
