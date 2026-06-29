import type { ReactNode } from "react";
import { t } from "ttag";

import { SectionLayout } from "metabase/data-studio/app/components/SectionLayout";
import { usePageTitle } from "metabase/hooks/use-page-title";

type ContentDiagnosticsSectionLayoutProps = {
  children?: ReactNode;
};

export function ContentDiagnosticsSectionLayout({
  children,
}: ContentDiagnosticsSectionLayoutProps) {
  usePageTitle(t`Content diagnostics`);

  return <SectionLayout>{children}</SectionLayout>;
}
