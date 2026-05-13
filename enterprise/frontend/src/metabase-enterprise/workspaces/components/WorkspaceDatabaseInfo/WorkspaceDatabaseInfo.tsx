import { t } from "ttag";

import { Group, Pill, Text } from "metabase/ui";
import type { Database, WorkspaceDatabase } from "metabase-types/api";

export type WorkspaceDatabaseInfoProps = {
  workspaceDatabase: WorkspaceDatabase;
  database: Database | undefined;
};

export function WorkspaceDatabaseInfo({
  workspaceDatabase,
  database,
}: WorkspaceDatabaseInfoProps) {
  const databaseLabel =
    database?.name ?? t`Database ${workspaceDatabase.database_id}`;

  return (
    <Group gap="sm">
      <Text fw="bold">{databaseLabel}</Text>
      <Group gap="sm">
        {workspaceDatabase.input_schemas.map((schema) => (
          <Pill key={schema}>{schema}</Pill>
        ))}
      </Group>
    </Group>
  );
}
