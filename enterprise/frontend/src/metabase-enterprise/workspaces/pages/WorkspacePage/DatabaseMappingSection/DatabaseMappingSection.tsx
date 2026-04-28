import { useState } from "react";
import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Button, Group, Stack, Text, Tooltip } from "metabase/ui";
import { TOOLTIP_OPEN_DELAY } from "metabase/utils/constants";
import { useUpdateWorkspaceMutation } from "metabase-enterprise/api";
import type {
  DatabaseId,
  Workspace,
  WorkspaceDatabase,
} from "metabase-types/api";

import { isDatabaseProvisioned } from "../../../utils";
import { TitleSection } from "../TitleSection";

import { DatabaseMappingItem } from "./DatabaseMappingItem";
import { DatabaseMappingModal } from "./DatabaseMappingModal";
import {
  getAddTooltipLabel,
  getAvailableDatabases,
  isSupportedDatabase,
} from "./utils";

type DatabaseMappingSectionProps = {
  workspace: Workspace;
};

export function DatabaseMappingSection({
  workspace,
}: DatabaseMappingSectionProps) {
  const [updateWorkspace] = useUpdateWorkspaceMutation();
  const { sendErrorToast } = useMetadataToasts();
  const [isModalOpened, setIsModalOpened] = useState(false);
  const [selectedDatabaseId, setSelectedDatabaseId] = useState<DatabaseId>();
  const { data: databasesResponse } = useListDatabasesQuery();

  const mappings = workspace.databases;
  const isReadOnly = mappings.some(isDatabaseProvisioned);
  const databases = databasesResponse?.data ?? [];
  const databasesById = new Map(databases.map((db) => [db.id, db]));

  const selectedMapping = mappings.find(
    (mapping) => mapping.database_id === selectedDatabaseId,
  );
  const supportedDatabases = databases.filter(isSupportedDatabase);
  const availableDatabases = getAvailableDatabases(databases, mappings);
  const canAddMapping = availableDatabases.length > 0 && !isReadOnly;

  const handleChange = async (next: WorkspaceDatabase[]) => {
    const { error } = await updateWorkspace({
      id: workspace.id,
      databases: next,
    });
    if (error) {
      sendErrorToast(t`Failed to update workspace`);
    }
  };

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
    handleChange([...mappings, mapping]);
  };

  const handleUpdate = (mapping: WorkspaceDatabase) => {
    handleChange(
      mappings.map((current) =>
        current.database_id === selectedDatabaseId ? mapping : current,
      ),
    );
  };

  const handleRemove = (mapping: WorkspaceDatabase) => {
    handleChange(
      mappings.filter((current) => current.database_id !== mapping.database_id),
    );
  };

  return (
    <>
      <TitleSection
        label={t`Database mapping`}
        description={t`Configure which databases are accessible from this workspace.`}
      >
        <Stack p="md">
          {mappings.map((mapping) => (
            <DatabaseMappingItem
              key={mapping.database_id}
              mapping={mapping}
              database={databasesById.get(mapping.database_id)}
              readOnly={isReadOnly}
              onEdit={() => handleOpenEdit(mapping)}
              onRemove={() => handleRemove(mapping)}
            />
          ))}
          <Group justify={mappings.length === 0 ? "space-between" : "flex-end"}>
            {mappings.length === 0 && (
              <Text c="text-secondary">{t`No databases mapped yet.`}</Text>
            )}
            <Tooltip
              label={getAddTooltipLabel({
                readOnly: isReadOnly,
                hasSupportedDatabases: supportedDatabases.length > 0,
                hasAvailableDatabases: availableDatabases.length > 0,
              })}
              disabled={canAddMapping}
              openDelay={TOOLTIP_OPEN_DELAY}
            >
              <Button disabled={!canAddMapping} onClick={handleOpenCreate}>
                {t`Add database`}
              </Button>
            </Tooltip>
          </Group>
        </Stack>
      </TitleSection>
      <DatabaseMappingModal
        opened={isModalOpened}
        mapping={selectedMapping}
        databases={getAvailableDatabases(
          databases,
          mappings,
          selectedDatabaseId,
        )}
        canDelete={mappings.length > 1}
        readOnly={isReadOnly}
        onSubmit={selectedMapping != null ? handleUpdate : handleAdd}
        onDelete={selectedMapping != null ? handleRemove : undefined}
        onClose={handleClose}
      />
    </>
  );
}
