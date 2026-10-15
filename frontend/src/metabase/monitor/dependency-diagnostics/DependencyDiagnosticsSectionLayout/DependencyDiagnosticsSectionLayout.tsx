import { t } from "ttag";

import { usePageTitle } from "metabase/hooks/use-page-title";
import { Outlet } from "metabase/router";
import { Stack } from "metabase/ui";

export function DependencyDiagnosticsSectionLayout() {
  usePageTitle(t`Dependency diagnostics`);

  return (
    <Stack h="100%" gap={0} bg="background_page-secondary">
      <Outlet />
    </Stack>
  );
}
