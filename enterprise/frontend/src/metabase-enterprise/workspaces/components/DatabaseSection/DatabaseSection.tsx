import { useDisclosure } from "@mantine/hooks";
import { useState } from "react";
import { t } from "ttag";

import { Button } from "metabase/ui";
import type {
  DatabaseId,
  Workspace,
  WorkspaceDatabase,
} from "metabase-types/api";

import { TitleSection } from "../TitleSection";

import { CreateDatabaseModal, UpdateDatabaseModal } from "./DatabaseModal";
import { DatabaseTable } from "./DatabaseTable";

type DatabaseSectionProps = {
  workspace: Workspace;
};

export function DatabaseSection({ workspace }: DatabaseSectionProps) {
  const workspaceDatabases = workspace.databases;
  const [isCreateOpened, { open: openCreate, close: closeCreate }] =
    useDisclosure(false);
  const [editingDatabaseId, setEditingDatabaseId] = useState<DatabaseId>();

  const handleOpenEdit = (workspaceDatabase: WorkspaceDatabase) => {
    setEditingDatabaseId(workspaceDatabase.database_id);
  };

  const handleCloseEdit = () => {
    setEditingDatabaseId(undefined);
  };

  return (
    <>
      <TitleSection
        label={t`Database configuration`}
        description={t`Configure which databases are accessible from this workspace.`}
        rightSection={
          <Button
            variant={workspaceDatabases.length === 0 ? "filled" : "default"}
            onClick={openCreate}
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
      <CreateDatabaseModal
        workspace={workspace}
        opened={isCreateOpened}
        onClose={closeCreate}
      />
      {editingDatabaseId != null && (
        <UpdateDatabaseModal
          workspace={workspace}
          databaseId={editingDatabaseId}
          opened
          onClose={handleCloseEdit}
        />
      )}
    </>
  );
}
