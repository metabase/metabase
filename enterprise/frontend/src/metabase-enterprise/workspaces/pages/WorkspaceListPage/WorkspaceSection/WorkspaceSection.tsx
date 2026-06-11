import { t } from "ttag";

import { Card, Group, Stack, Text, Title } from "metabase/ui";
import type { Database, Workspace } from "metabase-types/api";

import { NewWorkspaceButton } from "../NewWorkspaceButton";
import { WorkspaceItem } from "../WorkspaceItem";

export type WorkspaceSectionProps = {
  workspaces: Workspace[];
  databases: Database[];
};

export function WorkspaceSection({
  workspaces,
  databases,
}: WorkspaceSectionProps) {
  const hasWorkspaces = workspaces.length > 0;

  return (
    <Stack data-testid="workspace-list" gap="lg">
      <Group justify="space-between">
        <Title order={4}>{t`Active workspaces`}</Title>
        {hasWorkspaces && <NewWorkspaceButton databases={databases} />}
      </Group>
      {hasWorkspaces ? (
        workspaces.map((workspace) => (
          <WorkspaceItem key={workspace.id} workspace={workspace} />
        ))
      ) : (
        <WorkspaceSectionEmptyState databases={databases} />
      )}
    </Stack>
  );
}

type WorkspaceSectionEmptyStateProps = {
  databases: Database[];
};

function WorkspaceSectionEmptyState({
  databases,
}: WorkspaceSectionEmptyStateProps) {
  return (
    <Card p="xl" shadow="none" withBorder>
      <Stack p="sm" align="center">
        <Text c="text-secondary" ta="center" maw="25rem">
          {t`A workspace is created for each database that has workspaces enabled. You can view and modify its content from a developer instance.`}
        </Text>
        <NewWorkspaceButton databases={databases} primary />
      </Stack>
    </Card>
  );
}
