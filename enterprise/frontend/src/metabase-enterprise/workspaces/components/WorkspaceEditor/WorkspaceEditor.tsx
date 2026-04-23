import type { ReactNode } from "react";

import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import { Stack } from "metabase/ui";
import type { WorkspaceDatabaseDraft } from "metabase-types/api";

import type { WorkspaceInfo } from "../../types";

import { DatabaseMappingSection } from "./DatabaseMappingSection";
import { WorkspaceHeader } from "./WorkspaceHeader";
import { WorkspaceStatusSection } from "./WorkspaceStatusSection";

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

  return (
    <PageContainer data-testid="workspace-editor" gap="2.5rem">
      <WorkspaceHeader
        workspace={workspace}
        menu={menu}
        actions={actions}
        onNameChange={onNameChange}
      />
      <Stack gap="3.5rem">
        {!isNew && <WorkspaceStatusSection workspace={workspace} />}
        <DatabaseMappingSection
          workspace={workspace}
          onChange={onDatabasesChange}
        />
      </Stack>
    </PageContainer>
  );
}
