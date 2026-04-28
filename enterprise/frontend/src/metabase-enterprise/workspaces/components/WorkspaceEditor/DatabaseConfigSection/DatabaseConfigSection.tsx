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

import { DatabaseConfigModal } from "./DatabaseConfigModal";
import { DatabaseConfigTable } from "./DatabaseConfigTable";
import {
  getAddTooltipLabel,
  getAvailableDatabases,
  isSupportedDatabase,
} from "./utils";

type DatabaseConfigSectionProps = {
  workspace: WorkspaceInfo;
  onChange: (databases: WorkspaceDatabase[]) => void;
};

export function DatabaseConfigSection({
  workspace,
  onChange,
}: DatabaseConfigSectionProps) {
  const configs = workspace.databases;
  const isNew = workspace.id == null;
  const [isModalOpened, { open: openModal, close: closeModal }] =
    useDisclosure(false);
  const [selectedDatabaseId, setSelectedDatabaseId] = useState<DatabaseId>();
  const { data: databasesResponse } = useListDatabasesQuery();

  const isReadOnly = configs.some(isDatabaseProvisioned);
  const databases = databasesResponse?.data ?? [];
  const databasesById = new Map(databases.map((db) => [db.id, db]));

  const selectedConfig = configs.find(
    (config) => config.database_id === selectedDatabaseId,
  );
  const supportedDatabases = databases.filter(isSupportedDatabase);
  const availableDatabases = getAvailableDatabases(databases, configs);
  const canAddConfig = availableDatabases.length > 0 && !isReadOnly;

  const handleOpenCreate = () => {
    setSelectedDatabaseId(undefined);
    openModal();
  };

  const handleOpenEdit = (config: WorkspaceDatabase) => {
    setSelectedDatabaseId(config.database_id);
    openModal();
  };

  const handleClose = () => {
    closeModal();
    setSelectedDatabaseId(undefined);
  };

  const handleAdd = (config: WorkspaceDatabase) => {
    onChange([...configs, config]);
  };

  const handleUpdate = (config: WorkspaceDatabase) => {
    onChange(
      configs.map((current) =>
        current.database_id === selectedDatabaseId ? config : current,
      ),
    );
  };

  const handleRemove = (config: WorkspaceDatabase) => {
    onChange(
      configs.filter((current) => current.database_id !== config.database_id),
    );
  };

  const canRemoveConfig = selectedConfig != null && configs.length > 1;

  return (
    <>
      <TitleSection
        label={t`Database configuration`}
        description={t`Configure which databases are accessible from this workspace.`}
        rightSection={
          <Tooltip
            label={getAddTooltipLabel({
              readOnly: isReadOnly,
              hasSupportedDatabases: supportedDatabases.length > 0,
              hasAvailableDatabases: availableDatabases.length > 0,
            })}
            disabled={canAddConfig}
            openDelay={TOOLTIP_OPEN_DELAY}
          >
            <Button
              variant={configs.length === 0 ? "filled" : "default"}
              disabled={!canAddConfig}
              onClick={handleOpenCreate}
            >
              {t`Add database`}
            </Button>
          </Tooltip>
        }
      >
        {configs.length === 0 ? (
          <Box p="md">
            <Text c="text-secondary">{t`No databases configured yet.`}</Text>
          </Box>
        ) : (
          <DatabaseConfigTable
            configs={configs}
            databasesById={databasesById}
            withStatus={!isNew}
            onRowClick={handleOpenEdit}
          />
        )}
      </TitleSection>
      <DatabaseConfigModal
        opened={isModalOpened}
        config={selectedConfig}
        databases={getAvailableDatabases(
          databases,
          configs,
          selectedDatabaseId,
        )}
        readOnly={isReadOnly}
        canRemove={canRemoveConfig}
        onSubmit={selectedConfig != null ? handleUpdate : handleAdd}
        onDelete={handleRemove}
        onClose={handleClose}
      />
    </>
  );
}
