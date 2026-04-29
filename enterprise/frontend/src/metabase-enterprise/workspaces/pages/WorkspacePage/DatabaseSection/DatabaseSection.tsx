import { useMemo, useState } from "react";
import { t } from "ttag";

import { Button, Tooltip } from "metabase/ui";
import type {
  Database,
  DatabaseId,
  Workspace,
  WorkspaceDatabase,
} from "metabase-types/api";

import { TitleSection } from "../../../components/TitleSection";
import { getAvailableDatabases } from "../../../utils";

import { CreateDatabaseModal, UpdateDatabaseModal } from "./DatabaseModal";
import { DatabaseTable } from "./DatabaseTable";

type ModalType = "create" | "update";

type DatabaseSectionProps = {
  workspace: Workspace;
  databases: Database[];
};

export function DatabaseSection({
  workspace,
  databases,
}: DatabaseSectionProps) {
  const workspaceDatabases = workspace.databases;
  const [modalType, setModalType] = useState<ModalType | null>(null);
  const [selectedDatabaseId, setSelectedDatabaseId] = useState<DatabaseId>();

  const handleOpenCreate = () => {
    setSelectedDatabaseId(undefined);
    setModalType("create");
  };

  const handleOpenEdit = (workspaceDatabase: WorkspaceDatabase) => {
    setSelectedDatabaseId(workspaceDatabase.database_id);
    setModalType("update");
  };

  const handleClose = () => {
    setModalType(null);
    setSelectedDatabaseId(undefined);
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
            onClick={handleOpenCreate}
          />
        }
      >
        <DatabaseTable
          workspaceDatabases={workspaceDatabases}
          databases={databases}
          onRowClick={handleOpenEdit}
        />
      </TitleSection>
      {modalType === "create" && (
        <CreateDatabaseModal
          workspace={workspace}
          databases={databases}
          opened
          onClose={handleClose}
        />
      )}
      {modalType === "update" && selectedDatabaseId != null && (
        <UpdateDatabaseModal
          workspace={workspace}
          databaseId={selectedDatabaseId}
          databases={databases}
          opened
          onClose={handleClose}
        />
      )}
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
