import type { ReactNode } from "react";
import { t } from "ttag";

import { usePageTitle } from "metabase/hooks/use-page-title";
import { Stack } from "metabase/ui";

type DependencyDiagnosticsSectionLayoutProps = {
  children?: ReactNode;
};

export function DependencyDiagnosticsSectionLayout({
  children,
}: DependencyDiagnosticsSectionLayoutProps) {
  usePageTitle(t`Dependency diagnostics`);

  return (
    <Stack h="100%" gap={0} bg="background_page-secondary">
      {children}
    </Stack>
  );
}
