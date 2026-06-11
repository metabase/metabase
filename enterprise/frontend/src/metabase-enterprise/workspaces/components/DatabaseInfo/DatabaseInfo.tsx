import { c, msgid } from "ttag";

import { Group, Pill, Text } from "metabase/ui";
import type { Database, WorkspaceDatabase } from "metabase-types/api";

const SCHEMAS_LIMIT = 10;

export type DatabaseInfoProps = {
  workspaceDatabase: WorkspaceDatabase;
  database: Database | undefined;
};

export function DatabaseInfo({
  workspaceDatabase,
  database,
}: DatabaseInfoProps) {
  const allSchemas = workspaceDatabase.input_schemas;
  const visibleSchemas = allSchemas.slice(0, SCHEMAS_LIMIT);
  const hasMoreSchemas = allSchemas.length > SCHEMAS_LIMIT;
  const moreSchemasCount = hasMoreSchemas
    ? allSchemas.length - SCHEMAS_LIMIT
    : 0;

  return (
    <Group gap="sm">
      <Text fw="bold">{database?.name}</Text>
      <Group gap="sm">
        {visibleSchemas.map((schema) => (
          <Pill key={schema}>{schema}</Pill>
        ))}
        {hasMoreSchemas && (
          <Pill c="text-secondary">
            {c(
              "text shown after a list of schemas for a database, e.g. 'And 10 more'",
            ).ngettext(
              msgid`And ${moreSchemasCount} more`,
              `And ${moreSchemasCount} more`,
              moreSchemasCount,
            )}
          </Pill>
        )}
      </Group>
    </Group>
  );
}
