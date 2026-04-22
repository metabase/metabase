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
        <ExistingDatabaseMapping
          key={index}
          mapping={mapping}
          onChange={(newMapping) => handleChange(index, newMapping)}
          onRemove={() => handleRemove(index)}
        />
      ))}
      <NewDatabaseMapping onAdd={handleAdd} />
    </TitleSection>
  );
}

type NewDatabaseMappingProps = {
  onAdd: (mapping: WorkspaceDatabase) => void;
};

function NewDatabaseMapping({ onAdd }: NewDatabaseMappingProps) {
  const [databaseId, setDatabaseId] = useState<DatabaseId | undefined>();
  const [inputSchemas, setInputSchemas] = useState<string[]>([]);
  const newMapping = getDatabaseMapping(databaseId, inputSchemas);

  const handleAdd = () => {
    if (newMapping != null) {
      onAdd(newMapping);
    }
  };

  return (
    <DatabaseMappingForm
      databaseId={databaseId}
      inputSchemas={inputSchemas}
      isNew
      isDisabled={newMapping == null}
      onDatabaseChange={setDatabaseId}
      onInputSchemasChange={setInputSchemas}
      onSubmit={handleAdd}
    />
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
  const [databaseId, setDatabaseId] = useState(mapping.database_id);
  const [inputSchemas, setInputSchemas] = useState(mapping.input_schemas);

  const handleDatabaseChange = (newDatabaseId: DatabaseId) => {
    setDatabaseId(newDatabaseId);
    const newMapping = getDatabaseMapping(newDatabaseId, inputSchemas);
    if (newMapping != null) {
      onChange(newMapping);
    }
  };

  const handleInputSchemasChange = (newInputSchemas: string[]) => {
    setInputSchemas(newInputSchemas);
    const newMapping = getDatabaseMapping(databaseId, newInputSchemas);
    if (newMapping != null) {
      onChange(newMapping);
    }
  };

  return (
    <DatabaseMappingForm
      databaseId={databaseId}
      inputSchemas={inputSchemas}
      onDatabaseChange={handleDatabaseChange}
      onInputSchemasChange={handleInputSchemasChange}
      onSubmit={onRemove}
    />
  );
}

type DatabaseMappingFormProps = {
  databaseId: DatabaseId | undefined;
  inputSchemas: string[];
  isNew?: boolean;
  isDisabled?: boolean;
  onDatabaseChange: (newDatabaseId: DatabaseId) => void;
  onInputSchemasChange: (newInputSchemas: string[]) => void;
  onSubmit?: () => void;
};

function DatabaseMappingForm({
  databaseId,
  inputSchemas,
  isNew,
  isDisabled,
  onDatabaseChange,
  onInputSchemasChange,
  onSubmit,
}: DatabaseMappingFormProps) {
  const { data: databaseData } = useListDatabasesQuery();
  const { data: availableSchemas = [] } = useListDatabaseSchemasQuery(
    databaseId != null ? { id: databaseId } : skipToken,
  );

  return (
    <Group className={S.section} p="md" align="flex-end" wrap="nowrap">
      <DatabaseSelect
        databaseId={databaseId}
        databases={databaseData?.data ?? []}
        onChange={onDatabaseChange}
      />
      {databaseId != null && (
        <SchemaSelect
          inputSchemas={inputSchemas}
          availableSchemas={availableSchemas}
          onChange={onInputSchemasChange}
        />
      )}
      <Button
        variant={isNew ? "filled" : "default"}
        leftSection={<Icon name={isNew ? "add" : "close"} />}
        disabled={isDisabled}
        aria-label={isNew ? t`Add database` : t`Remove database`}
        onClick={onSubmit}
      />
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
      label={t`Schemas`}
      placeholder={t`Select schemas`}
      data={availableSchemas}
      value={inputSchemas}
      searchable
      onChange={onChange}
    />
  );
}
