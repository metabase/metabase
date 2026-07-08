import type { ReactNode } from "react";
import { t } from "ttag";

import { DataStudioBreadcrumbs } from "metabase/common/data-studio/components/DataStudioBreadcrumbs";
import {
  PaneHeader,
  type PaneHeaderTab,
  PaneHeaderTabs,
} from "metabase/common/data-studio/components/PaneHeader";
import * as Urls from "metabase/urls";

type WorkspacesHeaderProps = {
  actions?: ReactNode;
};

export function WorkspacesHeader({ actions }: WorkspacesHeaderProps) {
  const tabs: PaneHeaderTab[] = [
    {
      label: t`Workspaces`,
      to: Urls.workspaces(),
      icon: "workspace",
    },
    {
      label: t`Instances`,
      to: Urls.workspaceInstances(),
      icon: "cloud",
    },
  ];

  return (
    <PaneHeader
      breadcrumbs={
        <DataStudioBreadcrumbs>{t`Workspaces`}</DataStudioBreadcrumbs>
      }
      tabs={<PaneHeaderTabs tabs={tabs} />}
      actions={actions}
      py={0}
    />
  );
}
