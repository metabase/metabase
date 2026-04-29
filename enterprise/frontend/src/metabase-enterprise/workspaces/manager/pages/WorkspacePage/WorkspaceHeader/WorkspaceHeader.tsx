import type { ReactNode } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { useToast } from "metabase/common/hooks/use-toast";
import { DataStudioBreadcrumbs } from "metabase/data-studio/common/components/DataStudioBreadcrumbs";
import {
  PaneHeader,
  PaneHeaderInput,
} from "metabase/data-studio/common/components/PaneHeader";
import * as Urls from "metabase/utils/urls";
import { useUpdateWorkspaceMutation } from "metabase-enterprise/api";
import type { Workspace } from "metabase-types/api";

type WorkspaceHeaderProps = {
  workspace: Workspace;
  menu?: ReactNode;
};

export function WorkspaceHeader({ workspace, menu }: WorkspaceHeaderProps) {
  const [updateWorkspace] = useUpdateWorkspaceMutation();
  const [sendToast] = useToast();

  const handleNameChange = async (name: string) => {
    if (name === workspace.name) {
      return;
    }
    const { error } = await updateWorkspace({ id: workspace.id, name });
    if (error) {
      sendToast({
        icon: "warning_triangle_filled",
        iconColor: "warning",
        message: t`Failed to update workspace name`,
      });
    }
  };

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
      title={
        <PaneHeaderInput
          initialValue={workspace.name}
          onChange={handleNameChange}
        />
      }
      menu={menu}
      showMetabotButton
    />
  );
}
