import { t } from "ttag";

import { Card, Group, Text } from "metabase/ui";
import type { Database, Workspace } from "metabase-types/api";

import { AddWorkspaceDatabaseButton } from "../AddWorkspaceDatabaseButton";

export type WorkspaceDatabaseEmptyStateProps = {
  workspace: Workspace;
  availableDatabases: Database[];
};

export function WorkspaceDatabaseEmptyState({
  workspace,
  availableDatabases,
}: WorkspaceDatabaseEmptyStateProps) {
  return (
    <Card p="lg" shadow="none" withBorder>
      <Group justify="space-between" align="center" wrap="nowrap">
        <Text>{t`No databases have been added to this workspace yet.`}</Text>
        <AddWorkspaceDatabaseButton
          workspace={workspace}
          availableDatabases={availableDatabases}
        />
      </Group>
    </Card>
  );
}
