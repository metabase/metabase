import type { ReactNode } from "react";
import { t } from "ttag";

import { SectionLayout, SectionTitle } from "../../components/SectionLayout";

type DataModelLayoutProps = {
  children?: ReactNode;
};

export function DataModelLayout({ children }: DataModelLayoutProps) {
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
