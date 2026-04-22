import { memo } from "react";
import { t } from "ttag";

import { DataStudioBreadcrumbs } from "metabase/data-studio/common/components/DataStudioBreadcrumbs";
import {
  PaneHeader,
  type PaneHeaderTab,
  PaneHeaderTabs,
} from "metabase/data-studio/common/components/PaneHeader";
import * as Urls from "metabase/utils/urls";

export const WorkspaceInstanceHeader = memo(function WorkspaceInstanceHeader() {
  const tabs: PaneHeaderTab[] = [
    {
      label: t`Table Remappings`,
      to: Urls.workspaceInstanceRemappings(),
      icon: "table2",
    },
  ];

  return (
    <PaneHeader
      breadcrumbs={
        <DataStudioBreadcrumbs>{t`Workspace`}</DataStudioBreadcrumbs>
      }
      tabs={<PaneHeaderTabs tabs={tabs} />}
      py={0}
    />
  );
});
