import { memo } from "react";
import { t } from "ttag";

import { DataStudioBreadcrumbs } from "metabase/data-studio/common/components/DataStudioBreadcrumbs";
import {
  PaneHeader,
  type PaneHeaderTab,
  PaneHeaderTabs,
} from "metabase/data-studio/common/components/PaneHeader";
import * as Urls from "metabase/lib/urls";

export const ListHeader = memo(function ListHeader() {
  const tabs: PaneHeaderTab[] = [
    {
      label: t`Broken dependencies`,
      to: Urls.brokenDependencies(),
      icon: "broken_link",
    },
    {
      label: t`Unreferenced entities`,
      to: Urls.unreferencedDependencies(),
      icon: "unreferenced",
    },
  ];

  return (
    <PaneHeader
      breadcrumbs={
        <DataStudioBreadcrumbs>{t`Dependency diagnostics`}</DataStudioBreadcrumbs>
      }
      tabs={<PaneHeaderTabs tabs={tabs} />}
      py={0}
    />
  );
});
