import type { ReactNode } from "react";
import { t } from "ttag";

import { BenchSectionLayout } from "../../components/BenchSectionLayout";

type DataSectionLayoutProps = {
  children?: ReactNode;
};

export function DataSectionLayout({ children }: DataSectionLayoutProps) {
  return (
    <BenchSectionLayout
      title={t`Data structure`}
      description={t`Explore and manage your data assets`}
    >
      {children}
    </BenchSectionLayout>
  );
}
