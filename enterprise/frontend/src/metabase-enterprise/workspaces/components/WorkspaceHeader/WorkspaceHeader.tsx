import type { ReactNode } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { DataStudioBreadcrumbs } from "metabase/data-studio/common/components/DataStudioBreadcrumbs";
import {
  PaneHeader,
  PaneHeaderInput,
} from "metabase/data-studio/common/components/PaneHeader";
import * as Urls from "metabase/utils/urls";
import type { Workspace } from "metabase-types/api";

type WorkspaceHeaderProps = {
  workspace: Workspace;
  menu?: ReactNode;
  onNameChange: (name: string) => void;
};

export function WorkspaceHeader({
  workspace,
  menu,
  onNameChange,
}: WorkspaceHeaderProps) {
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
          onChange={onNameChange}
        />
      }
      menu={menu}
      showMetabotButton
    />
  );
}
