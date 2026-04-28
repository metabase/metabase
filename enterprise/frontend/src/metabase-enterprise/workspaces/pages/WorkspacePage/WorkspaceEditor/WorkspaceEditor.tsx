import { Stack } from "metabase/ui";
import type { WorkspaceDatabase } from "metabase-types/api";

import type { WorkspaceInfo } from "../../../types";
import { DangerSection } from "../DangerSection";
import { DatabaseMappingSection } from "../DatabaseMappingSection";
import { ProvisionSection } from "../ProvisionSection";
import { SaveSection } from "../SaveSection";
import { SetupSection } from "../SetupSection";
import { WorkspaceHeader } from "../WorkspaceHeader";

type WorkspaceEditorProps = {
  workspace: WorkspaceInfo;
  onNameChange: (name: string) => void;
  onDatabasesChange: (databases: WorkspaceDatabase[]) => void;
};

export function WorkspaceEditor({
  workspace,
  onNameChange,
  onDatabasesChange,
}: WorkspaceEditorProps) {
  return (
    <Stack gap="3.25rem">
      <WorkspaceHeader workspace={workspace} onNameChange={onNameChange} />
      <DatabaseMappingSection
        databases={workspace.databases}
        onChange={onDatabasesChange}
      />
      <ProvisionSection workspace={workspace} />
      <SetupSection workspace={workspace} />
      <DangerSection workspace={workspace} />
      {workspace.id == null && <SaveSection workspace={workspace} />}
    </Stack>
  );
}
