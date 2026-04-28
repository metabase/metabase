import { useDisclosure } from "@mantine/hooks";
import { useState } from "react";
import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api";
import { Box, Button, Text, Tooltip } from "metabase/ui";
import { TOOLTIP_OPEN_DELAY } from "metabase/utils/constants";
import type { DatabaseId, WorkspaceDatabase } from "metabase-types/api";

import type { WorkspaceInfo } from "../../../types";
import { isDatabaseProvisioned } from "../../../utils";
import { TitleSection } from "../TitleSection";

import { DatabaseMappingModal } from "./DatabaseMappingModal";
import { DatabaseMappingTable } from "./DatabaseMappingTable";
import {
  getAddTooltipLabel,
  getAvailableDatabases,
  isSupportedDatabase,
} from "./utils";

type DatabaseMappingSectionProps = {
  workspace: WorkspaceInfo;
  onChange: (databases: WorkspaceDatabase[]) => void;
};

export function DatabaseMappingSection({
  workspace,
  onChange,
}: DatabaseMappingSectionProps) {
  const mappings = workspace.databases;
  const isNew = workspace.id == null;
  const [isModalOpened, { open: openModal, close: closeModal }] =
    useDisclosure(false);
  const [selectedDatabaseId, setSelectedDatabaseId] = useState<DatabaseId>();
  const { data: databasesResponse } = useListDatabasesQuery();

  const isReadOnly = mappings.some(isDatabaseProvisioned);
  const databases = databasesResponse?.data ?? [];
  const databasesById = new Map(databases.map((db) => [db.id, db]));

  const selectedMapping = mappings.find(
    (mapping) => mapping.database_id === selectedDatabaseId,
  );
  const supportedDatabases = databases.filter(isSupportedDatabase);
  const availableDatabases = getAvailableDatabases(databases, mappings);
  const canAddMapping = availableDatabases.length > 0 && !isReadOnly;

  const handleOpenCreate = () => {
    setSelectedDatabaseId(undefined);
    openModal();
  };

  const handleOpenEdit = (mapping: WorkspaceDatabase) => {
    setSelectedDatabaseId(mapping.database_id);
    openModal();
  };

  const handleClose = () => {
    closeModal();
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

  const handleRemove = (mapping: WorkspaceDatabase) => {
    onChange(
      mappings.filter((current) => current.database_id !== mapping.database_id),
    );
  };

  return (
    <>
      <TitleSection
        label={t`Database mapping`}
        description={t`Configure which databases are accessible from this workspace.`}
        rightSection={
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
        }
      >
        {mappings.length === 0 ? (
          <Box p="md">
            <Text c="text-secondary">{t`No databases mapped yet.`}</Text>
          </Box>
        ) : (
          <DatabaseMappingTable
            mappings={mappings}
            databasesById={databasesById}
            withStatus={!isNew}
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
        readOnly={isReadOnly}
        onSubmit={selectedMapping != null ? handleUpdate : handleAdd}
        onDelete={selectedMapping != null ? handleRemove : undefined}
        onClose={handleClose}
      />
    </>
  );
}
