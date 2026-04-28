import type { ReactNode } from "react";

import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import { Stack } from "metabase/ui";
import type { WorkspaceDatabase } from "metabase-types/api";

import type { WorkspaceInfo } from "../../../types";
import { isDatabaseProvisioned } from "../../../utils";
import { DatabaseMappingSection } from "../DatabaseMappingSection";
import { SetupSection } from "../SetupSection";
import { StatusSection } from "../StatusSection";
import { WorkspaceHeader } from "../WorkspaceHeader";

type WorkspaceEditorProps = {
  workspace: WorkspaceInfo;
  menu?: ReactNode;
  actions?: ReactNode;
  onNameChange: (name: string) => void;
  onDatabasesChange: (databases: WorkspaceDatabase[]) => void;
};

export function WorkspaceEditor({
  workspace,
  menu,
  actions,
  onNameChange,
  onDatabasesChange,
}: WorkspaceEditorProps) {
  const isFullyProvisioned =
    workspace.databases.length > 0 &&
    workspace.databases.every(isDatabaseProvisioned);

  return (
    <PageContainer data-testid="workspace-editor" gap="2.5rem">
      <WorkspaceHeader
        workspace={workspace}
        menu={menu}
        actions={actions}
        onNameChange={onNameChange}
      />
      <Stack gap="3.25rem">
        <StatusSection workspace={workspace} />
        <DatabaseMappingSection
          workspace={workspace}
          onChange={onDatabasesChange}
        />
        {isFullyProvisioned && <SetupSection workspace={workspace} />}
      </Stack>
    </PageContainer>
  );
}
