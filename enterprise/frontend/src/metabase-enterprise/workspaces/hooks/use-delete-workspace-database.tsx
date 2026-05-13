import { t } from "ttag";

import { useConfirmation } from "metabase/common/hooks/use-confirmation";
import { useDeleteWorkspaceDatabaseMutation } from "metabase-enterprise/api";
import type {
  Database,
  Workspace,
  WorkspaceDatabase,
} from "metabase-types/api";

export type DeleteWorkspaceDatabaseProps = {
  database: Database | undefined;
  onSuccess?: () => void;
};

export function useDeleteWorkspaceDatabase({
  database,
  onSuccess,
}: DeleteWorkspaceDatabaseProps) {
  const { modalContent, show } = useConfirmation();
  const [deleteWorkspaceDatabase] = useDeleteWorkspaceDatabaseMutation();

  const handleDelete = (
    workspace: Workspace,
    workspaceDatabase: WorkspaceDatabase,
  ) => {
    const databaseLabel = database ? database.name : t`database`;

    show({
      title: t`Remove ${databaseLabel} from this workspace?`,
      message: t`This will delete the temporary user and schema from this database.`,
      confirmButtonText: t`Remove`,
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
