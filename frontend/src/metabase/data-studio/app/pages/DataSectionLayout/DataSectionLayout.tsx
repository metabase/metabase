import { t } from "ttag";

import { usePageTitle } from "metabase/hooks/use-page-title";
import { Outlet } from "metabase/router";

import { SectionLayout } from "../../components/SectionLayout";

export function DataSectionLayout() {
  usePageTitle(t`Tables`);

  return (
    <SectionLayout>
      <Outlet />
    </SectionLayout>
  );
}
