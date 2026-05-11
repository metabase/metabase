import type { ReactNode } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { DataStudioBreadcrumbs } from "metabase/data-studio/common/components/DataStudioBreadcrumbs";
import {
  PaneHeader,
  PaneHeaderInput,
} from "metabase/data-studio/common/components/PaneHeader";
import * as Urls from "metabase/urls";

import type { WorkspaceInfo } from "../../../types";

export type WorkspaceHeaderProps = {
  workspace: WorkspaceInfo;
  actions?: ReactNode;
  onChangeName: (name: string) => void;
};

export function WorkspaceHeader({
  workspace,
  actions,
  onChangeName,
}: WorkspaceHeaderProps) {
  return (
    <PaneHeader
      title={
        <PaneHeaderInput
          initialValue={workspace.name}
          onChange={onChangeName}
        />
      }
      breadcrumbs={
        <DataStudioBreadcrumbs>
          <Link key="workspace-list" to={Urls.workspaceList()}>
            {t`Workspaces`}
          </Link>
          {workspace.name}
        </DataStudioBreadcrumbs>
      }
      actions={actions}
      py={0}
    />
  );
}
