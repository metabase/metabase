import type { ReactNode } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { DataStudioBreadcrumbs } from "metabase/data-studio/common/components/DataStudioBreadcrumbs";
import {
  PaneHeader,
  PaneHeaderInput,
} from "metabase/data-studio/common/components/PaneHeader";
import * as Urls from "metabase/urls";

export type WorkspaceHeaderProps = {
  name: string;
  actions?: ReactNode;
  onChangeName: (name: string) => void;
};

export function WorkspaceHeader({
  name,
  actions,
  onChangeName,
}: WorkspaceHeaderProps) {
  return (
    <PaneHeader
      title={<PaneHeaderInput initialValue={name} onChange={onChangeName} />}
      breadcrumbs={
        <DataStudioBreadcrumbs>
          <Link key="workspace-list" to={Urls.workspaceList()}>
            {t`Workspaces`}
          </Link>
          {name}
        </DataStudioBreadcrumbs>
      }
      actions={actions}
      py={0}
    />
  );
}
