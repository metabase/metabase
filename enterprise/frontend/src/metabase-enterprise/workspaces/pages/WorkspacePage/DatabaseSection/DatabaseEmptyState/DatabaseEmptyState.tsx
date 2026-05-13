import { t } from "ttag";

import { Card, Group, Text } from "metabase/ui";
import type { Database, Workspace } from "metabase-types/api";

import { AddDatabaseButton } from "../AddDatabaseButton";

export type DatabaseEmptyStateProps = {
  workspace: Workspace;
  availableDatabases: Database[];
};

export function DatabaseEmptyState({
  workspace,
  availableDatabases,
}: DatabaseEmptyStateProps) {
  return (
    <Card p="lg" shadow="none" withBorder>
      <Group justify="space-between" align="center" wrap="nowrap">
        <Text>{t`No databases have been added to this workspace yet.`}</Text>
        <AddDatabaseButton
          workspace={workspace}
          availableDatabases={availableDatabases}
        />
      </Group>
    </Card>
  );
}
