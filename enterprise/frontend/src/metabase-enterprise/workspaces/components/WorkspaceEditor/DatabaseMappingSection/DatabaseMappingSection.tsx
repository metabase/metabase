import { useState } from "react";
import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api";
import { ListEmptyState } from "metabase/common/components/ListEmptyState";
import { Box, Button, Icon, Tooltip } from "metabase/ui";
import { TOOLTIP_OPEN_DELAY } from "metabase/utils/constants";
import type { DatabaseId, WorkspaceDatabaseDraft } from "metabase-types/api";

import type { WorkspaceInfo } from "../../../types";
import { isDatabaseProvisioned } from "../../../utils";
import { TitleSection } from "../../TitleSection";

import { DatabaseMappingList } from "./DatabaseMappingList";
import { DatabaseMappingModal } from "./DatabaseMappingModal";
import { getAddTooltipLabel, getAvailableDatabases } from "./utils";

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
        description={t`Select readable schemas per database. Provisioning creates an isolation schema for transform output.`}
        rightSection={
          <Tooltip
            label={getAddTooltipLabel(isReadOnly)}
            disabled={canAddMapping}
            openDelay={TOOLTIP_OPEN_DELAY}
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
