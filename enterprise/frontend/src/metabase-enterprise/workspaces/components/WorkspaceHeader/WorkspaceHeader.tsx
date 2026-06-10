import { memo } from "react";
import { t } from "ttag";

import { DataStudioBreadcrumbs } from "metabase/data-studio/common/components/DataStudioBreadcrumbs";
import {
  PaneHeader,
  type PaneHeaderTab,
  PaneHeaderTabs,
} from "metabase/data-studio/common/components/PaneHeader";
import * as Urls from "metabase/urls";

export const WorkspaceHeader = memo(function WorkspaceHeader() {
  const tabs: PaneHeaderTab[] = [
    {
      label: t`Workspaces`,
      to: Urls.workspaces(),
      icon: "folder",
    },
    {
      label: t`Development instances`,
      to: Urls.workspaceInstances(),
      icon: "database",
    },
  ];

  return (
    <PaneHeader
      breadcrumbs={
        <DataStudioBreadcrumbs>{t`Workspaces`}</DataStudioBreadcrumbs>
      }
      tabs={<PaneHeaderTabs tabs={tabs} />}
      py={0}
    />
  );
});
