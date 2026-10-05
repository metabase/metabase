import { t } from "ttag";

import { usePageTitle } from "metabase/hooks/use-page-title";
import { Outlet } from "metabase/router";

import { SectionLayout } from "../../components/SectionLayout";

export function ActionsSectionLayout() {
  usePageTitle(t`Data actions`, { titleIndex: 1 });

  return (
    <SectionLayout>
      <Outlet />
    </SectionLayout>
  );
}
