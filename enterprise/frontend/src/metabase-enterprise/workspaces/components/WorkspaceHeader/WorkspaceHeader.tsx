import type { ReactNode } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { DataStudioBreadcrumbs } from "metabase/data-studio/common/components/DataStudioBreadcrumbs";
import { PaneHeader } from "metabase/data-studio/common/components/PaneHeader";
import * as Urls from "metabase/utils/urls";
import type { Workspace } from "metabase-types/api";

import { WorkspaceMoreMenu } from "./WorkspaceMoreMenu";
import { WorkspaceNameInput } from "./WorkspaceNameInput";
import { WorkspaceTabs } from "./WorkspaceTabs";

type WorkspaceHeaderProps = {
  workspace: Workspace;
  actions?: ReactNode;
};

export function WorkspaceHeader({ workspace, actions }: WorkspaceHeaderProps) {
  return (
    <PaneHeader
      py={0}
      breadcrumbs={
        <DataStudioBreadcrumbs>
          <Link key="workspace-list" to={Urls.workspaceList()}>
            {t`Workspaces`}
          </Link>
          {workspace.name}
        </DataStudioBreadcrumbs>
      }
      title={<WorkspaceNameInput workspace={workspace} />}
      menu={<WorkspaceMoreMenu workspace={workspace} />}
      tabs={<WorkspaceTabs workspace={workspace} />}
      actions={actions}
      showMetabotButton
    />
  );
}
