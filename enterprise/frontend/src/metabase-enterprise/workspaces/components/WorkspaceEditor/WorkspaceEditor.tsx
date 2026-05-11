import type { ReactNode } from "react";

import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import { Stack } from "metabase/ui";
import type { Database } from "metabase-types/api";

import { DatabaseListSection } from "./DatabaseListSection";
import { SetupSection } from "./SetupSection";
import { WorkspaceHeader } from "./WorkspaceHeader";
import type { WorkspaceDatabaseInfo, WorkspaceInfo } from "./types";

export type WorkspaceEditorProps = {
  workspace: WorkspaceInfo;
  availableDatabases: Database[];
  actions?: ReactNode;
  onChangeName: (name: string) => void;
  onChangeDatabases: (databases: WorkspaceDatabaseInfo[]) => void;
};

export function WorkspaceEditor({
  workspace,
  availableDatabases,
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
          availableDatabases={availableDatabases}
          onChangeDatabases={onChangeDatabases}
        />
      </Stack>
    </PageContainer>
  );
}
