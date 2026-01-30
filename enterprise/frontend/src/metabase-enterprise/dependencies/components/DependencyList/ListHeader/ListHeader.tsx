import { memo } from "react";
import { t } from "ttag";

import * as Urls from "metabase/lib/urls";
import { DataStudioBreadcrumbs } from "metabase-enterprise/data-studio/common/components/DataStudioBreadcrumbs";
import {
  PaneHeader,
  type PaneHeaderTab,
  PaneHeaderTabs,
} from "metabase-enterprise/data-studio/common/components/PaneHeader";

export const ListHeader = memo(function ListHeader() {
  const tabs: PaneHeaderTab[] = [
    {
      label: t`Broken dependencies`,
      to: Urls.breakingDependencies(),
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
