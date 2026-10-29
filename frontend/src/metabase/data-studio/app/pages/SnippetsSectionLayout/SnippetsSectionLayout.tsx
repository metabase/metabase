import { t } from "ttag";

import { usePageTitle } from "metabase/hooks/use-page-title";
import { Outlet } from "metabase/router";

export function SnippetsSectionLayout() {
  usePageTitle(t`SQL snippets`);

  return <Outlet />;
}
