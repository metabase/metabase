import { useState } from "react";
import { t } from "ttag";

import { Button } from "metabase/ui";
import type {
  DatabaseId,
  Workspace,
  WorkspaceDatabase,
} from "metabase-types/api";

import { TitleSection } from "../../../components/TitleSection";

import { CreateDatabaseModal, UpdateDatabaseModal } from "./DatabaseModal";
import { DatabaseTable } from "./DatabaseTable";

type ModalType = "create" | "update";

type DatabaseSectionProps = {
  workspace: Workspace;
};

export function DatabaseSection({ workspace }: DatabaseSectionProps) {
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
          <Button
            variant={workspaceDatabases.length === 0 ? "filled" : "default"}
            onClick={handleOpenCreate}
          >
            {t`Add database`}
          </Button>
        }
      >
        <DatabaseTable
          workspaceDatabases={workspaceDatabases}
          onRowClick={handleOpenEdit}
        />
      </TitleSection>
      {modalType === "create" && (
        <CreateDatabaseModal
          workspace={workspace}
          opened
          onClose={handleClose}
        />
      )}
      {modalType === "update" && selectedDatabaseId != null && (
        <UpdateDatabaseModal
          workspace={workspace}
          databaseId={selectedDatabaseId}
          opened
          onClose={handleClose}
        />
      )}
    </>
  );
}
