import type { ReactNode } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { DataStudioBreadcrumbs } from "metabase/data-studio/common/components/DataStudioBreadcrumbs";
import {
  PaneHeader,
  PaneHeaderInput,
} from "metabase/data-studio/common/components/PaneHeader";
import * as Urls from "metabase/utils/urls";

import type { WorkspaceInfo } from "../../../types";

type WorkspaceHeaderProps = {
  workspace: WorkspaceInfo;
  menu?: ReactNode;
  actions?: ReactNode;
  onNameChange: (name: string) => void;
};

export function WorkspaceHeader({
  workspace,
  menu,
  actions,
  onNameChange,
}: WorkspaceHeaderProps) {
  const isNew = workspace.id == null;

  return (
    <PaneHeader
      py={0}
      breadcrumbs={
        <DataStudioBreadcrumbs>
          <Link key="workspace-list" to={Urls.workspaceList()}>
            {t`Workspaces`}
          </Link>
          {isNew ? t`New workspace` : workspace.name}
        </DataStudioBreadcrumbs>
      }
      title={
        <PaneHeaderInput
          initialValue={workspace.name}
          placeholder={t`New workspace`}
          onChange={onNameChange}
        />
      }
      menu={menu}
      actions={actions}
      showMetabotButton
    />
  );
}
