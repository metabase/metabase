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
  isReadOnly?: boolean;
  onNameChange: (name: string) => void;
  onDatabasesChange: (databases: WorkspaceDatabaseDraft[]) => void;
};

export function WorkspaceEditor({
  workspace,
  menu,
  actions,
  isReadOnly,
  onNameChange,
  onDatabasesChange,
}: WorkspaceEditorProps) {
  return (
    <PageContainer data-testid="workspace-editor" gap="2.5rem">
      <WorkspaceHeader
        workspace={workspace}
        menu={menu}
        actions={actions}
        onNameChange={onNameChange}
      />
      <Stack gap="3.5rem">
        {workspace.id != null && (
          <WorkspaceStatusSection workspace={workspace} />
        )}
        <DatabaseMappingSection
          mappings={workspace.databases}
          isReadOnly={isReadOnly}
          onChange={onDatabasesChange}
        />
      </Stack>
    </PageContainer>
  );
}
