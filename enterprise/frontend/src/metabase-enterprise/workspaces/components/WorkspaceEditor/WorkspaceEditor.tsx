import type { ReactNode } from "react";

import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import { Stack } from "metabase/ui";
import type { WorkspaceDatabaseDraft } from "metabase-types/api";

import type { WorkspaceInfo } from "../../types";
import { isDatabaseProvisioned } from "../../utils";

import { DatabaseMappingSection } from "./DatabaseMappingSection";
import { SetupSection } from "./SetupSection";
import { StatusSection } from "./StatusSection";
import { WorkspaceHeader } from "./WorkspaceHeader";

type WorkspaceEditorProps = {
  workspace: WorkspaceInfo;
  menu?: ReactNode;
  actions?: ReactNode;
  onNameChange: (name: string) => void;
  onDatabasesChange: (databases: WorkspaceDatabaseDraft[]) => void;
};

export function WorkspaceEditor({
  workspace,
  menu,
  actions,
  onNameChange,
  onDatabasesChange,
}: WorkspaceEditorProps) {
  const isNew = workspace.id == null;
  const isFullyProvisioned = workspace.databases.every(isDatabaseProvisioned);

  return (
    <PageContainer data-testid="workspace-editor" gap="2.5rem">
      <WorkspaceHeader
        workspace={workspace}
        menu={menu}
        actions={actions}
        onNameChange={onNameChange}
      />
      <Stack gap="3.5rem">
        {!isNew && <StatusSection workspace={workspace} />}
        <DatabaseMappingSection
          workspace={workspace}
          onChange={onDatabasesChange}
        />
        {!isNew && isFullyProvisioned && <SetupSection workspace={workspace} />}
      </Stack>
    </PageContainer>
  );
}
