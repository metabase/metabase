import { t } from "ttag";

import { useConfirmation } from "metabase/common/hooks/use-confirmation";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { useDeleteWorkspaceMutation } from "metabase-enterprise/api";
import type { Workspace } from "metabase-types/api";

export type DeleteWorkspaceOptions = {
  onSuccess?: () => void;
};

export function useDeleteWorkspace({ onSuccess }: DeleteWorkspaceOptions = {}) {
  const { modalContent, show } = useConfirmation();
  const [deleteWorkspace] = useDeleteWorkspaceMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  const handleDelete = (workspace: Workspace) => {
    show({
      title: t`Delete ${workspace.name}`,
      message: t`This will deprovision the workspace and remove it permanently.`,
      confirmButtonText: t`Delete`,
      confirmButtonProps: { color: "danger" },
      onConfirm: async () => {
        const { error } = await deleteWorkspace(workspace.id);
        if (error) {
          sendErrorToast(t`Failed to delete workspace`);
        } else {
          sendSuccessToast(t`Workspace deleted`);
          onSuccess?.();
        }
      },
    });
  };

  return { handleDelete, modalContent };
}
