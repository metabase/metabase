import { t } from "ttag";

import { Group, Stack, Title } from "metabase/ui";
import type {
  Database,
  Workspace,
  WorkspaceInstance,
} from "metabase-types/api";

import { CreateWorkspaceButton } from "./CreateWorkspaceButton";
import { WorkspaceEmptyState } from "./WorkspaceEmptyState";
import { WorkspaceItem } from "./WorkspaceItem";

type WorkspaceSectionProps = {
  workspaces: Workspace[];
  databases: Database[];
  instances: WorkspaceInstance[];
};

export function WorkspaceSection({
  workspaces,
  databases,
  instances,
}: WorkspaceSectionProps) {
  const isEmpty = workspaces.length === 0;

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={4}>{t`Active workspaces`}</Title>
        {!isEmpty && (
          <CreateWorkspaceButton
            databases={databases}
            workspaceInstances={instances}
          />
        )}
      </Group>
      {isEmpty ? (
        <WorkspaceEmptyState
          databases={databases}
          workspaceInstances={instances}
        />
      ) : (
        <Stack>
          {workspaces.map((workspace) => (
            <WorkspaceItem key={workspace.id} workspace={workspace} />
          ))}
        </Stack>
      )}
    </Stack>
  );
}
