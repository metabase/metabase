import { t } from "ttag";

import { useConfirmation } from "metabase/common/hooks/use-confirmation";
import { useDeleteWorkspaceDatabaseMutation } from "metabase-enterprise/api";
import type {
  Database,
  Workspace,
  WorkspaceDatabase,
} from "metabase-types/api";

export type DeleteWorkspaceDatabaseProps = {
  availableDatabases: Database[];
  onSuccess?: () => void;
};

export function useDeleteWorkspaceDatabase({
  availableDatabases,
  onSuccess,
}: DeleteWorkspaceDatabaseProps) {
  const { modalContent, show } = useConfirmation();
  const [deleteWorkspaceDatabase] = useDeleteWorkspaceDatabaseMutation();

  const handleDelete = (
    workspace: Workspace,
    workspaceDatabase: WorkspaceDatabase,
  ) => {
    const database = availableDatabases.find(
      (candidate) => candidate.id === workspaceDatabase.database_id,
    );
    const databaseLabel = database
      ? database.name
      : t`Database ${workspaceDatabase.database_id}`;

    show({
      title: t`Deprovision ${databaseLabel}?`,
      message: t`This will delete the temporary user and schema from the database.`,
      confirmButtonText: t`Deprovision`,
      confirmButtonProps: { color: "danger" },
      onConfirm: async () => {
        await deleteWorkspaceDatabase({
          id: workspace.id,
          database_id: workspaceDatabase.database_id,
        }).unwrap();
        onSuccess?.();
      },
    });
  };

  return { handleDelete, modalContent };
}
