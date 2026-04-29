import { useDisclosure } from "@mantine/hooks";
import { useMemo, useState } from "react";
import { t } from "ttag";

import { useConfirmation } from "metabase/common/hooks/use-confirmation";
import { Button, Tooltip } from "metabase/ui";
import { useDeleteWorkspaceDatabaseMutation } from "metabase-enterprise/api";
import { TitleSection } from "metabase-enterprise/workspaces/common/components/TitleSection";
import type {
  Database,
  DatabaseId,
  Workspace,
  WorkspaceDatabase,
} from "metabase-types/api";

import { getAvailableDatabases } from "../../../utils";

import { CreateDatabaseModal, UpdateDatabaseModal } from "./DatabaseModal";
import { DatabaseTable } from "./DatabaseTable";

type DatabaseSectionProps = {
  workspace: Workspace;
  databases: Database[];
};

export function DatabaseSection({
  workspace,
  databases,
}: DatabaseSectionProps) {
  const [isCreateOpen, { open: openCreate, close: closeCreate }] =
    useDisclosure(false);
  const [isUpdateOpen, { open: openUpdate, close: closeUpdate }] =
    useDisclosure(false);
  const [selectedDatabaseId, setSelectedDatabaseId] = useState<DatabaseId>();
  const [deleteWorkspaceDatabase] = useDeleteWorkspaceDatabaseMutation();
  const { modalContent: deleteModalContent, show: showDeleteConfirmation } =
    useConfirmation();

  const handleUpdateOpen = (workspaceDatabase: WorkspaceDatabase) => {
    setSelectedDatabaseId(workspaceDatabase.database_id);
    openUpdate();
  };

  const handleUpdateClose = () => {
    closeUpdate();
    setSelectedDatabaseId(undefined);
  };

  const handleDelete = (workspaceDatabase: WorkspaceDatabase) => {
    const database = databases.find(
      (db) => db.id === workspaceDatabase.database_id,
    );
    showDeleteConfirmation({
      title: database
        ? t`Remove ${database.name} from this workspace?`
        : t`Remove the database from this workspace?`,
      message: t`The isolation schema and the database user in this database will be dropped. This cannot be undone.`,
      confirmButtonText: t`Remove`,
      confirmButtonProps: { variant: "filled", color: "error" },
      onConfirm: async () => {
        await deleteWorkspaceDatabase({
          workspace_id: workspace.id,
          database_id: workspaceDatabase.database_id,
        }).unwrap();
      },
    });
  };

  return (
    <>
      <TitleSection
        label={t`Database configuration`}
        description={t`Configure which databases are accessible from this workspace.`}
        rightSection={
          <AddDatabaseButton
            workspace={workspace}
            databases={databases}
            onClick={openCreate}
          />
        }
      >
        <DatabaseTable
          workspaceDatabases={workspace.databases}
          databases={databases}
          onEdit={handleUpdateOpen}
          onDelete={handleDelete}
        />
      </TitleSection>
      {isCreateOpen && (
        <CreateDatabaseModal
          workspace={workspace}
          databases={databases}
          opened
          onClose={closeCreate}
        />
      )}
      {isUpdateOpen && selectedDatabaseId != null && (
        <UpdateDatabaseModal
          workspace={workspace}
          databaseId={selectedDatabaseId}
          databases={databases}
          opened
          onClose={handleUpdateClose}
        />
      )}
      {deleteModalContent}
    </>
  );
}

type AddDatabaseButtonProps = {
  workspace: Workspace;
  databases: Database[];
  onClick: () => void;
};

function AddDatabaseButton({
  workspace,
  databases,
  onClick,
}: AddDatabaseButtonProps) {
  const availableDatabases = useMemo(
    () => getAvailableDatabases(databases, workspace.databases),
    [databases, workspace.databases],
  );
  const isEmpty = workspace.databases.length === 0;
  const isDisabled = availableDatabases.length === 0;

  return (
    <Tooltip
      label={t`All supported databases are already added.`}
      disabled={!isDisabled}
    >
      <Button
        variant={isEmpty ? "filled" : "default"}
        disabled={isDisabled}
        onClick={onClick}
      >
        {t`Add database`}
      </Button>
    </Tooltip>
  );
}
