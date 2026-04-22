import { t } from "ttag";

import { PaneHeaderTabs } from "metabase/data-studio/common/components/PaneHeader";
import * as Urls from "metabase/utils/urls";
import type { Workspace } from "metabase-types/api";

type WorkspaceTabsProps = {
  workspace: Workspace;
};

export function WorkspaceTabs({ workspace }: WorkspaceTabsProps) {
  const overviewUrl = Urls.workspace(workspace.id);
  const databasesUrl = Urls.workspaceDatabases(workspace.id);

  return (
    <PaneHeaderTabs
      tabs={[
        {
          label: t`Overview`,
          to: overviewUrl,
          isSelected: (pathname) => pathname === overviewUrl,
        },
        {
          label: t`Databases`,
          to: databasesUrl,
          isSelected: (pathname) => pathname.startsWith(databasesUrl),
        },
      ]}
    />
  );
}
