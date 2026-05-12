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
      title: t`Delete ${workspace.name}?`,
      message: t`This will deprovision the workspace and remove it permanently.`,
      confirmButtonText: t`Delete`,
      confirmButtonProps: { color: "danger" },
      onConfirm: async () => {
        await deleteWorkspace(workspace.id).unwrap();
        onSuccess?.();
      },
    });
  };

  return { handleDelete, modalContent };
}
