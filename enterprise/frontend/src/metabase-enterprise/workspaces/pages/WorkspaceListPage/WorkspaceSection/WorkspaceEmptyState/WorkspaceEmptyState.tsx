import { t } from "ttag";

import { Card, Stack, Text } from "metabase/ui";
import type { Database, WorkspaceInstance } from "metabase-types/api";

import { CreateWorkspaceButton } from "../CreateWorkspaceButton";

type WorkspaceEmptyStateProps = {
  databases: Database[];
  workspaceInstances: WorkspaceInstance[];
};

export function WorkspaceEmptyState({
  databases,
  workspaceInstances,
}: WorkspaceEmptyStateProps) {
  return (
    <Card p="xl" shadow="none" withBorder>
      <Stack align="center" maw="25rem" mx="auto">
        <Text c="text-secondary" ta="center">
          {t`A workspace will be associated with a new git branch, and its content can be viewed and modified in a development instance.`}
        </Text>
        <CreateWorkspaceButton
          databases={databases}
          workspaceInstances={workspaceInstances}
          primary
        />
      </Stack>
    </Card>
  );
}
