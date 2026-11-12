import { t } from "ttag";

import { usePageTitle } from "metabase/hooks/use-page-title";
import { Outlet } from "metabase/router";

export function DataAppsSectionLayout() {
  usePageTitle(t`Data apps`);

  return <Outlet />;
}
