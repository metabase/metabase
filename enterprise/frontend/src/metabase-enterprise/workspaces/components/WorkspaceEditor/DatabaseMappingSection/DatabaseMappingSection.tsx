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

import type { WorkspaceInfo } from "../../../types";
import { isDatabaseProvisioned, isSupportedDatabase } from "../../../utils";
import { TitleSection } from "../../TitleSection";

import { DatabaseMappingList } from "./DatabaseMappingList";
import { DatabaseMappingModal } from "./DatabaseMappingModal";

type DatabaseMappingSectionProps = {
  workspace: WorkspaceInfo;
  onChange: (mappings: WorkspaceDatabaseDraft[]) => void;
};

export function DatabaseMappingSection({
  workspace,
  onChange,
}: DatabaseMappingSectionProps) {
  const [isModalOpened, setIsModalOpened] = useState(false);
  const [selectedDatabaseId, setSelectedDatabaseId] = useState<DatabaseId>();
  const { data: databasesResponse } = useListDatabasesQuery();

  const mappings = workspace.databases;
  const isNew = workspace.id == null;
  const isReadOnly = mappings.some(isDatabaseProvisioned);

  const databases = databasesResponse?.data ?? [];
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
            label={getAddTooltipLabel(isReadOnly)}
            disabled={canAddMapping}
          >
            <Button
              leftSection={<Icon name="add" />}
              variant={mappings.length === 0 ? "filled" : undefined}
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
            <ListEmptyState
              label={t`Add at least one database to create this workspace.`}
            />
          </Box>
        ) : (
          <DatabaseMappingList
            mappings={mappings}
            onRowClick={handleOpenEdit}
          />
        )}
      </TitleSection>
      <DatabaseMappingModal
        opened={isModalOpened}
        mapping={selectedMapping}
        databases={getAvailableDatabases(
          databases,
          mappings,
          selectedDatabaseId,
        )}
        canDelete={isNew || mappings.length > 1}
        isReadOnly={isReadOnly}
        onSubmit={selectedMapping != null ? handleUpdate : handleAdd}
        onDelete={selectedMapping != null ? handleDelete : undefined}
        onClose={handleClose}
      />
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
      isSupportedDatabase(database) &&
      (!mappedIds.has(database.id) || database.id === databaseId),
  );
}

function getAddTooltipLabel(isReadOnly: boolean): string {
  return isReadOnly
    ? t`Unprovision this workspace before editing.`
    : t`No available databases that support workspaces.`;
}
