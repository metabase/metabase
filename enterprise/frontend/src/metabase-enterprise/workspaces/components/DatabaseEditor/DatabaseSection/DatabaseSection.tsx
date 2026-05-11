import { useMemo } from "react";
import { t } from "ttag";

import { useListDatabaseSchemasQuery } from "metabase/api";
import {
  Button,
  Card,
  Group,
  Icon,
  MultiSelect,
  Select,
  Stack,
} from "metabase/ui";
import type { Database, DatabaseId } from "metabase-types/api";

import type { WorkspaceDatabaseInfo } from "../../../types";

export type DatabaseSectionProps = {
  workspaceDatabase: WorkspaceDatabaseInfo;
  availableDatabases: Database[];
  canRemove: boolean;
  onDatabaseChange: (workspaceDatabase: WorkspaceDatabaseInfo) => void;
  onDatabaseRemove: () => void;
};

export function DatabaseSection({
  workspaceDatabase,
  availableDatabases,
  canRemove,
  onDatabaseChange,
  onDatabaseRemove,
}: DatabaseSectionProps) {
  const handleDatabaseChange = (newDatabaseId: DatabaseId | undefined) => {
    const newWorkspaceDatabase: WorkspaceDatabaseInfo = {
      ...workspaceDatabase,
      database_id: newDatabaseId,
      input: [],
    };
    onDatabaseChange(newWorkspaceDatabase);
  };

  const handleSchemasChange = (newSchemas: string[]) => {
    const newWorkspaceDatabase: WorkspaceDatabaseInfo = {
      ...workspaceDatabase,
      input: newSchemas.map((schema) => ({ db: null, schema })),
    };
    onDatabaseChange(newWorkspaceDatabase);
  };

  const selectedSchemas = useMemo(
    () =>
      workspaceDatabase.input
        .map((input) => input.schema)
        .filter((schema) => schema != null),
    [workspaceDatabase.input],
  );

  return (
    <Card p="lg" shadow="none" withBorder>
      <Stack gap="lg">
        <Group
          align="flex-start"
          justify="space-between"
          gap="md"
          wrap="nowrap"
        >
          <DatabaseSelect
            databases={availableDatabases}
            value={workspaceDatabase.database_id}
            onChange={handleDatabaseChange}
          />
          {canRemove && (
            <Button
              aria-label={t`Remove database`}
              leftSection={<Icon name="trash" />}
              onClick={onDatabaseRemove}
            />
          )}
        </Group>
        {workspaceDatabase.database_id != null && (
          <SchemaMultiSelect
            databaseId={workspaceDatabase.database_id}
            value={selectedSchemas}
            onChange={handleSchemasChange}
          />
        )}
      </Stack>
    </Card>
  );
}

type DatabaseSelectProps = {
  databases: Database[];
  value: DatabaseId | undefined;
  onChange: (databaseId: DatabaseId | undefined) => void;
};

function DatabaseSelect({ databases, value, onChange }: DatabaseSelectProps) {
  const data = useMemo(
    () =>
      databases.map((database) => ({
        value: String(database.id),
        label: database.name,
      })),
    [databases],
  );

  return (
    <Select
      label={t`Database`}
      placeholder={t`Pick database`}
      data={data}
      value={value != null ? String(value) : null}
      onChange={(newValue) =>
        onChange(newValue != null ? Number(newValue) : undefined)
      }
    />
  );
}

type SchemaMultiSelectProps = {
  databaseId: DatabaseId;
  value: string[];
  onChange: (schemas: string[]) => void;
};

function SchemaMultiSelect({
  databaseId,
  value,
  onChange,
}: SchemaMultiSelectProps) {
  const { data: schemas = [] } = useListDatabaseSchemasQuery({
    id: databaseId,
  });

  return (
    <MultiSelect
      label={t`Schemas to include`}
      placeholder={t`Pick schemas`}
      data={schemas}
      value={value}
      onChange={onChange}
    />
  );
}
