import type { ReactNode } from "react";
import { t } from "ttag";

import { SectionLayout, SectionTitle } from "../../components/SectionLayout";

type ModelingSectionLayoutProps = {
  children?: ReactNode;
};

export function ModelingSectionLayout({
  children,
}: ModelingSectionLayoutProps) {
  return (
    <SectionLayout
      title={
        <SectionTitle
          title={t`Modeling`}
          description={t`Build your semantic layer`}
        />
      }
    >
      {children}
    </SectionLayout>
  );
}
