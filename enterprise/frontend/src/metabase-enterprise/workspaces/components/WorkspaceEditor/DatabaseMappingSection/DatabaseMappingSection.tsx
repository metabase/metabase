import { useState } from "react";
import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api";
import { Button, Group, Icon, Paper, Stack, Text, Tooltip } from "metabase/ui";
import { TOOLTIP_OPEN_DELAY } from "metabase/utils/constants";
import type {
  Database,
  DatabaseId,
  WorkspaceDatabase,
} from "metabase-types/api";

import { isDatabaseProvisioned } from "../../../utils";

import { DatabaseMappingModal } from "./DatabaseMappingModal";
import { getAddTooltipLabel, getAvailableDatabases } from "./utils";

type DatabaseMappingSectionProps = {
  databases: WorkspaceDatabase[];
  onChange: (databases: WorkspaceDatabase[]) => void;
};

export function DatabaseMappingSection({
  databases: mappings,
  onChange,
}: DatabaseMappingSectionProps) {
  const [isModalOpened, setIsModalOpened] = useState(false);
  const [selectedDatabaseId, setSelectedDatabaseId] = useState<DatabaseId>();
  const { data: databasesResponse } = useListDatabasesQuery();

  const isReadOnly = mappings.some(isDatabaseProvisioned);
  const databases = databasesResponse?.data ?? [];
  const databasesById = new Map(databases.map((db) => [db.id, db]));

  const selectedMapping = mappings.find(
    (mapping) => mapping.database_id === selectedDatabaseId,
  );
  const availableDatabases = getAvailableDatabases(databases, mappings);
  const hasAvailableDatabases = availableDatabases.length > 0;
  const canAddMapping = hasAvailableDatabases && !isReadOnly;

  const handleOpenCreate = () => {
    setSelectedDatabaseId(undefined);
    setIsModalOpened(true);
  };

  const handleOpenEdit = (mapping: WorkspaceDatabase) => {
    setSelectedDatabaseId(mapping.database_id);
    setIsModalOpened(true);
  };

  const handleClose = () => {
    setIsModalOpened(false);
    setSelectedDatabaseId(undefined);
  };

  const handleAdd = (mapping: WorkspaceDatabase) => {
    onChange([...mappings, mapping]);
  };

  const handleUpdate = (mapping: WorkspaceDatabase) => {
    onChange(
      mappings.map((current) =>
        current.database_id === selectedDatabaseId ? mapping : current,
      ),
    );
  };

  const handleDelete = (mapping: WorkspaceDatabase) => {
    onChange(
      mappings.filter((current) => current.database_id !== mapping.database_id),
    );
  };

  return (
    <>
      <Group justify="flex-end">
        <Tooltip
          label={getAddTooltipLabel(isReadOnly)}
          disabled={canAddMapping}
          openDelay={TOOLTIP_OPEN_DELAY}
        >
          <Button
            leftSection={<Icon name="add" />}
            disabled={!canAddMapping}
            onClick={handleOpenCreate}
          >{t`Add database`}</Button>
        </Tooltip>
      </Group>
      {mappings.length > 0 && (
        <Stack>
          {mappings.map((mapping) => (
            <DatabaseMappingItem
              key={mapping.database_id}
              mapping={mapping}
              database={databasesById.get(mapping.database_id)}
              onClick={() => handleOpenEdit(mapping)}
            />
          ))}
        </Stack>
      )}
      <DatabaseMappingModal
        opened={isModalOpened}
        mapping={selectedMapping}
        databases={getAvailableDatabases(
          databases,
          mappings,
          selectedDatabaseId,
        )}
        canDelete={mappings.length > 1}
        isReadOnly={isReadOnly}
        onSubmit={selectedMapping != null ? handleUpdate : handleAdd}
        onDelete={selectedMapping != null ? handleDelete : undefined}
        onClose={handleClose}
      />
    </>
  );
}

type DatabaseMappingItemProps = {
  mapping: WorkspaceDatabase;
  database?: Database;
  onClick: () => void;
};

function DatabaseMappingItem({
  mapping,
  database,
  onClick,
}: DatabaseMappingItemProps) {
  return (
    <Paper
      withBorder
      shadow="0"
      p="lg"
      onClick={onClick}
      style={{ cursor: "pointer" }}
    >
      <Stack gap="sm">
        <Group gap="sm" align="center">
          <Icon name="database" />
          <Text fw={700}>{database?.name ?? t`Database`}</Text>
        </Group>
        <Group gap="sm" align="center">
          <Icon name="schema" />
          <Text c="text-secondary">{mapping.input_schemas.join(" ")}</Text>
        </Group>
      </Stack>
    </Paper>
  );
}
