import { memo } from "react";
import { t } from "ttag";

import { DataStudioBreadcrumbs } from "metabase/data-studio/common/components/DataStudioBreadcrumbs";
import {
  PaneHeader,
  type PaneHeaderTab,
  PaneHeaderTabs,
} from "metabase/data-studio/common/components/PaneHeader";
import * as Urls from "metabase/utils/urls";

type WorkspaceInstanceHeaderProps = {
  workspaceName?: string;
};

export const WorkspaceInstanceHeader = memo(function WorkspaceInstanceHeader({
  workspaceName,
}: WorkspaceInstanceHeaderProps) {
  const tabs: PaneHeaderTab[] = [
    {
      label: t`Overview`,
      to: Urls.workspaceInstanceOverview(),
    },
    {
      label: t`Transform Runs`,
      to: Urls.workspaceInstanceRuns(),
    },
    {
      label: t`Table Remappings`,
      to: Urls.workspaceInstanceRemappings(),
    },
  ];

  return (
    <PaneHeader
      breadcrumbs={
        <DataStudioBreadcrumbs>
          {t`Workspace`}
          {workspaceName}
        </DataStudioBreadcrumbs>
      }
      tabs={<PaneHeaderTabs tabs={tabs} />}
      py={0}
    />
  );
});
