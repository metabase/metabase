import { t } from "ttag";

import { usePageTitle } from "metabase/hooks/use-page-title";
import { Outlet } from "metabase/router";

import { SectionLayout } from "../../components/SectionLayout";

export function WorkspacesSectionLayout() {
  usePageTitle(t`Workspaces`, { titleIndex: 1 });

  return (
    <SectionLayout>
      <Outlet />
    </SectionLayout>
  );
}
