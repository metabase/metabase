import { useState } from "react";
import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api";
import { ListEmptyState } from "metabase/common/components/ListEmptyState";
import { Box, Button, Icon, Tooltip } from "metabase/ui";
import type {
  Database,
  DatabaseId,
  WorkspaceDatabaseDraft,
} from "metabase-types/api";

import { isWorkspaceDatabase } from "../../utils";
import { TitleSection } from "../TitleSection";

import { DatabaseMappingList } from "./DatabaseMappingList";
import { DatabaseMappingModal } from "./DatabaseMappingModal";

type DatabaseMappingSectionProps = {
  mappings: WorkspaceDatabaseDraft[];
  onChange: (mappings: WorkspaceDatabaseDraft[]) => void;
};

export function DatabaseMappingSection({
  mappings,
  onChange,
}: DatabaseMappingSectionProps) {
  const [isModalOpened, setIsModalOpened] = useState(false);
  const [selectedDatabaseId, setSelectedDatabaseId] = useState<DatabaseId>();

  const { data: databasesResponse } = useListDatabasesQuery();
  const allDatabases = databasesResponse?.data ?? [];

  const selectedMapping = mappings.find(
    (mapping) => mapping.database_id === selectedDatabaseId,
  );

  const newAvailableDatabases = getAvailableDatabases(allDatabases, mappings);
  const selectedAvailableDatabases = getAvailableDatabases(
    allDatabases,
    mappings,
    selectedDatabaseId,
  );
  const canAddMapping = newAvailableDatabases.length > 0;

  const handleOpenCreate = () => {
    setSelectedDatabaseId(undefined);
    setIsModalOpened(true);
  };

  const handleOpenEdit = (mapping: WorkspaceDatabaseDraft) => {
    setSelectedDatabaseId(mapping.database_id);
    setIsModalOpened(true);
  };

  const handleClose = () => {
    setIsModalOpened(false);
    setSelectedDatabaseId(undefined);
  };

  const handleAdd = (mapping: WorkspaceDatabaseDraft) => {
    onChange([...mappings, mapping]);
  };

  const handleUpdate = (mapping: WorkspaceDatabaseDraft) => {
    const newMappings = mappings.map((current) =>
      current.database_id === selectedDatabaseId ? mapping : current,
    );
    onChange(newMappings);
  };

  const handleDelete = (mapping: WorkspaceDatabaseDraft) => {
    const newMappings = mappings.filter(
      (current) => current.database_id !== mapping.database_id,
    );
    onChange(newMappings);
  };

  return (
    <>
      <TitleSection
        label={t`Database isolation`}
        description={t`Configure how databases are isolated for this workspace.`}
        rightSection={
          <Tooltip
            label={t`No available databases that support workspaces.`}
            disabled={canAddMapping}
          >
            <Button
              leftSection={<Icon name="add" />}
              disabled={!canAddMapping}
              onClick={handleOpenCreate}
            >
              {t`Add database`}
            </Button>
          </Tooltip>
        }
      >
        {mappings.length === 0 ? (
          <Box p="xl">
            <ListEmptyState label={t`No databases yet`} />
          </Box>
        ) : (
          <DatabaseMappingList
            mappings={mappings}
            onRowClick={handleOpenEdit}
          />
        )}
      </TitleSection>
      {isModalOpened && (
        <DatabaseMappingModal
          mapping={selectedMapping}
          databases={
            selectedMapping != null
              ? selectedAvailableDatabases
              : newAvailableDatabases
          }
          onSubmit={selectedMapping != null ? handleUpdate : handleAdd}
          onDelete={selectedMapping != null ? handleDelete : undefined}
          onClose={handleClose}
        />
      )}
    </>
  );
}

function getAvailableDatabases(
  databases: Database[],
  mappings: WorkspaceDatabaseDraft[],
  databaseId?: DatabaseId,
): Database[] {
  const mappedIds = new Set(mappings.map((mapping) => mapping.database_id));
  return databases.filter(
    (database) =>
      isWorkspaceDatabase(database) &&
      (!mappedIds.has(database.id) || database.id === databaseId),
  );
}
