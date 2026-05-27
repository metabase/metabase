import { t } from "ttag";

import { useConfirmation } from "metabase/common/hooks/use-confirmation";
import { useDeleteWorkspaceMutation } from "metabase-enterprise/api";
import type { Workspace } from "metabase-types/api";

export type DeleteWorkspaceProps = {
  onSuccess?: () => void;
};

export function useDeleteWorkspace({ onSuccess }: DeleteWorkspaceProps = {}) {
  const { modalContent, show } = useConfirmation();
  const [deleteWorkspace] = useDeleteWorkspaceMutation();

  const handleDelete = (workspace: Workspace) => {
    show({
      title: t`Delete this workspace?`,
      message: t`This will delete the workspace as well as the temporary database users and schemas that were created for this workspace. This can’t be undone.`,
      confirmButtonText: t`Delete workspace`,
      confirmButtonProps: { color: "danger" },
      onConfirm: async () => {
        await deleteWorkspace(workspace.id).unwrap();
        onSuccess?.();
      },
    });
  };

  return { handleDelete, modalContent };
}
