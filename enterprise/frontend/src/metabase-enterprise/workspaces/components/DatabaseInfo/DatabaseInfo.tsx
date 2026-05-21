import { Group, Pill, Text } from "metabase/ui";
import type { Database, WorkspaceDatabase } from "metabase-types/api";

export type DatabaseInfoProps = {
  workspaceDatabase: WorkspaceDatabase;
  database: Database | undefined;
};

export function DatabaseInfo({
  workspaceDatabase,
  database,
}: DatabaseInfoProps) {
  return (
    <Group gap="sm">
      <Text fw="bold">{database?.name}</Text>
      <Group gap="sm">
        {workspaceDatabase.input_schemas.map((schema) => (
          <Pill key={schema}>{schema}</Pill>
        ))}
      </Group>
    </Group>
  );
}
