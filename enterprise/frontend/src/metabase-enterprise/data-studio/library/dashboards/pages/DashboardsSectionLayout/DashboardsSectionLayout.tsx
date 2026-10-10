import { t } from "ttag";

import { usePageTitle } from "metabase/hooks/use-page-title";
import { Outlet } from "metabase/router";

export function DashboardsSectionLayout() {
  usePageTitle(t`Dashboards`);

  return <Outlet />;
}
