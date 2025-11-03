import type { ReactNode } from "react";
import { t } from "ttag";

import {
  BenchSectionLayout,
  BenchSectionTitle,
} from "../../components/BenchSectionLayout";

type ModelingSectionLayoutProps = {
  children?: ReactNode;
};

export function ModelingSectionLayout({
  children,
}: ModelingSectionLayoutProps) {
  return (
    <BenchSectionLayout
      title={
        <BenchSectionTitle
          title={t`Modeling`}
          description={t`Build your semantic layer`}
        />
      }
    >
      {children}
    </BenchSectionLayout>
  );
}
