import { t } from "ttag";

import { SectionLayout } from "metabase/data-studio/app/components/SectionLayout";
import { usePageTitle } from "metabase/hooks/use-page-title";
import { Outlet } from "metabase/router";

export function DependencyDiagnosticsSectionLayout() {
  usePageTitle(t`Dependency diagnostics`);

  return (
    <SectionLayout>
      <Outlet />
    </SectionLayout>
  );
}
