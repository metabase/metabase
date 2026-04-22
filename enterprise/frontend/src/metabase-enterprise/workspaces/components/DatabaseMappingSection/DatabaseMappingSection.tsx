import type { ReactNode } from "react";
import { useState } from "react";
import { t } from "ttag";

import {
  skipToken,
  useListDatabaseSchemasQuery,
  useListDatabasesQuery,
} from "metabase/api";
import { ActionIcon, Box, Group, Icon, MultiSelect, Select } from "metabase/ui";
import type {
  Database,
  DatabaseId,
  WorkspaceDatabaseMapping as WorkspaceDatabase,
} from "metabase-types/api";

import { TitleSection } from "../TitleSection";

import S from "./DatabaseMappingSection.module.css";

type DatabaseMappingSectionProps = {
  mappings: WorkspaceDatabase[];
  onChange: (newDatabases: WorkspaceDatabase[]) => void;
};

export function DatabaseMappingSection({
  mappings,
  onChange,
}: DatabaseMappingSectionProps) {
  const handleAdd = (mapping: WorkspaceDatabase) => {
    onChange([...mappings, mapping]);
  };

  const handleChange = (index: number, mapping: WorkspaceDatabase) => {
    const newMappings = [...mappings];
    newMappings[index] = mapping;
    onChange(newMappings);
  };

  const handleRemove = (index: number) => {
    const newMappings = [...mappings];
    newMappings.splice(index, 1);
    onChange(newMappings);
  };

  return (
    <TitleSection label={t`Database mapping`}>
      {mappings.map((mapping, index) => (
        <DatabaseSection key={index}>
          <ExistingDatabaseMapping
            mapping={mapping}
            onChange={(newMapping) => handleChange(index, newMapping)}
            onRemove={() => handleRemove(index)}
          />
        </DatabaseSection>
      ))}
      <DatabaseSection>
        <NewDatabaseMapping onAdd={handleAdd} />
      </DatabaseSection>
    </TitleSection>
  );
}

type NewDatabaseMappingProps = {
  onAdd: (mapping: WorkspaceDatabase) => void;
};

function NewDatabaseMapping({ onAdd }: NewDatabaseMappingProps) {
  const [databaseId, setDatabaseId] = useState<DatabaseId | undefined>(
    undefined,
  );
  const [inputSchemas, setInputSchemas] = useState<string[]>([]);
  const { data: databaseData } = useListDatabasesQuery();
  const { data: availableSchemas = [] } = useListDatabaseSchemasQuery(
    databaseId != null ? { id: databaseId } : skipToken,
  );
  const mapping = getDatabaseMapping(databaseId, inputSchemas);

  const handleAdd = () => {
    if (mapping != null) {
      onAdd(mapping);
    }
  };

  return (
    <Group wrap="nowrap">
      <DatabaseSelect
        databaseId={databaseId}
        databases={databaseData?.data ?? []}
        onChange={setDatabaseId}
      />
      <SchemaSelect
        inputSchemas={inputSchemas}
        availableSchemas={availableSchemas}
        onChange={setInputSchemas}
      />
      <ActionIcon
        variant="subtle"
        aria-label={t`Add database`}
        disabled={mapping == null}
        onClick={handleAdd}
      >
        <Icon name="add" />
      </ActionIcon>
    </Group>
  );
}

function getDatabaseMapping(
  databaseId: DatabaseId | undefined,
  inputSchemas: string[],
): WorkspaceDatabase | undefined {
  if (databaseId != null && inputSchemas.length > 0) {
    return {
      database_id: databaseId,
      input_schemas: inputSchemas,
      output_schema: "",
    };
  }
}

type ExistingDatabaseMappingProps = {
  mapping: WorkspaceDatabase;
  onChange: (newMapping: WorkspaceDatabase) => void;
  onRemove: () => void;
};

function ExistingDatabaseMapping({
  mapping,
  onChange,
  onRemove,
}: ExistingDatabaseMappingProps) {
  const { database_id: databaseId, input_schemas: inputSchemas } = mapping;
  const { data: databaseData } = useListDatabasesQuery();
  const { data: availableSchemas = [] } = useListDatabaseSchemasQuery(
    mapping.database_id != null ? { id: mapping.database_id } : skipToken,
  );

  const handleDatabaseChange = (newDatabaseId: DatabaseId) => {
    onChange({ ...mapping, database_id: newDatabaseId });
  };

  const handleInputSchemasChange = (newInputSchemas: string[]) => {
    if (newInputSchemas.length > 0) {
      onChange({ ...mapping, input_schemas: newInputSchemas });
    }
  };

  return (
    <Group wrap="nowrap">
      <DatabaseSelect
        databaseId={databaseId}
        databases={databaseData?.data ?? []}
        onChange={handleDatabaseChange}
      />
      <SchemaSelect
        inputSchemas={inputSchemas}
        availableSchemas={availableSchemas}
        onChange={handleInputSchemasChange}
      />
      <ActionIcon
        variant="subtle"
        aria-label={t`Remove database`}
        onClick={onRemove}
      >
        <Icon name="close" />
      </ActionIcon>
    </Group>
  );
}

type DatabaseSelectProps = {
  databaseId: DatabaseId | undefined;
  databases: Database[];
  onChange: (newDatabaseId: DatabaseId) => void;
};

function DatabaseSelect({
  databaseId,
  databases,
  onChange,
}: DatabaseSelectProps) {
  const options = databases.map((database) => ({
    value: getDatabaseValue(database.id),
    label: database.name,
    database,
  }));

  const handleChange = (newValue: string | null) => {
    if (newValue != null) {
      onChange(getDatabaseId(newValue));
    }
  };

  return (
    <Select
      data={options}
      value={databaseId != null ? getDatabaseValue(databaseId) : null}
      label={t`Database`}
      placeholder={t`Select a database`}
      onChange={handleChange}
    />
  );
}

function getDatabaseId(value: string) {
  return Number(value);
}

function getDatabaseValue(databaseId: DatabaseId): string {
  return String(databaseId);
}

type SchemaSelectProps = {
  inputSchemas: string[];
  availableSchemas: string[];
  onChange: (newInputSchemas: string[]) => void;
};

function SchemaSelect({
  inputSchemas,
  availableSchemas,
  onChange,
}: SchemaSelectProps) {
  return (
    <MultiSelect
      label={t`Readable schemas`}
      placeholder={t`Select schemas`}
      data={availableSchemas}
      value={inputSchemas}
      searchable
      onChange={onChange}
    />
  );
}

type DatabaseSectionProps = {
  children?: ReactNode;
};

function DatabaseSection({ children }: DatabaseSectionProps) {
  return (
    <Box className={S.section} p="md">
      {children}
    </Box>
  );
}
