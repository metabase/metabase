import type { ReactNode } from "react";

import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import { Stack } from "metabase/ui";

import { DatabaseListSection } from "./DatabaseListSection";
import { SetupSection } from "./SetupSection";
import { WorkspaceHeader } from "./WorkspaceHeader";
import type { WorkspaceDatabaseInfo, WorkspaceInfo } from "./types";

export type WorkspaceEditorProps = {
  workspace: WorkspaceInfo;
  actions?: ReactNode;
  onChangeName: (name: string) => void;
  onChangeDatabases: (databases: WorkspaceDatabaseInfo[]) => void;
};

export function WorkspaceEditor({
  workspace,
  actions,
  onChangeName,
  onChangeDatabases,
}: WorkspaceEditorProps) {
  return (
    <PageContainer data-testid="workspace-editor" gap="2.5rem">
      <WorkspaceHeader
        workspace={workspace}
        actions={actions}
        onChangeName={onChangeName}
      />
      <Stack gap="3.5rem">
        <SetupSection workspace={workspace} />
        <DatabaseListSection
          workspace={workspace}
          onChangeDatabases={onChangeDatabases}
        />
      </Stack>
    </PageContainer>
  );
}
