import { useState } from "react";
import { t } from "ttag";

import {
  skipToken,
  useListDatabaseSchemasQuery,
  useListDatabasesQuery,
} from "metabase/api";
import { Button, Group, Icon, MultiSelect, Select } from "metabase/ui";
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
        <DatabaseMappingForm
          key={index}
          mapping={mapping}
          onChange={(newMapping) => handleChange(index, newMapping)}
          onRemove={() => handleRemove(index)}
        />
      ))}
      <DatabaseMappingForm onAdd={handleAdd} />
    </TitleSection>
  );
}

type DatabaseMappingFormProps = {
  mapping?: WorkspaceDatabase;
  onAdd?: (newMapping: WorkspaceDatabase) => void;
  onChange?: (newMapping: WorkspaceDatabase) => void;
  onRemove?: () => void;
};

function DatabaseMappingForm({
  mapping: initialMapping,
  onAdd,
  onChange,
  onRemove,
}: DatabaseMappingFormProps) {
  const [databaseId, setDatabaseId] = useState(initialMapping?.database_id);
  const [inputSchemas, setInputSchemas] = useState(
    initialMapping?.input_schemas ?? [],
  );
  const { data: databaseData } = useListDatabasesQuery();
  const { data: availableSchemas = [] } = useListDatabaseSchemasQuery(
    databaseId != null ? { id: databaseId } : skipToken,
  );

  const newMapping = getDatabaseMapping(databaseId, inputSchemas);
  const isNew = initialMapping == null;

  const handleDatabaseChange = (newDatabaseId: DatabaseId) => {
    setDatabaseId(newDatabaseId);
    const newMapping = getDatabaseMapping(newDatabaseId, inputSchemas);
    if (newMapping != null) {
      onChange?.(newMapping);
    }
  };

  const handleInputSchemasChange = (newInputSchemas: string[]) => {
    setInputSchemas(newInputSchemas);
    const newMapping = getDatabaseMapping(databaseId, newInputSchemas);
    if (newMapping != null) {
      onChange?.(newMapping);
    }
  };

  const handleAdd = () => {
    if (newMapping != null) {
      onAdd?.(newMapping);
    }
  };

  return (
    <Group className={S.section} p="md" align="flex-end" wrap="nowrap">
      <DatabaseSelect
        databaseId={databaseId}
        databases={databaseData?.data ?? []}
        onChange={handleDatabaseChange}
      />
      {databaseId != null && (
        <SchemaSelect
          inputSchemas={inputSchemas}
          availableSchemas={availableSchemas}
          isError={!isNew && inputSchemas.length === 0}
          onChange={handleInputSchemasChange}
        />
      )}
      <Button
        variant={isNew ? "filled" : "default"}
        leftSection={<Icon name={isNew ? "add" : "close"} />}
        disabled={isNew && newMapping == null}
        aria-label={isNew ? t`Add database` : t`Remove database`}
        onClick={isNew ? handleAdd : onRemove}
      />
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
  isError?: boolean;
  onChange: (newInputSchemas: string[]) => void;
};

function SchemaSelect({
  inputSchemas,
  availableSchemas,
  isError,
  onChange,
}: SchemaSelectProps) {
  return (
    <MultiSelect
      data={availableSchemas}
      value={inputSchemas}
      label={t`Schemas`}
      placeholder={t`Select schemas`}
      error={isError}
      searchable
      onChange={onChange}
    />
  );
}
