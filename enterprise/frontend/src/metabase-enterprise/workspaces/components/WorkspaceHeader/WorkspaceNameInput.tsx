import { t } from "ttag";

import { PaneHeaderInput } from "metabase/data-studio/common/components/PaneHeader";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { useUpdateWorkspaceMutation } from "metabase-enterprise/api";
import type { Workspace } from "metabase-types/api";

type WorkspaceNameInputProps = {
  workspace: Workspace;
};

export function WorkspaceNameInput({ workspace }: WorkspaceNameInputProps) {
  const [updateWorkspace] = useUpdateWorkspaceMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  const handleChange = async (name: string) => {
    if (name === workspace.name) {
      return;
    }
    const { error } = await updateWorkspace({ id: workspace.id, name });
    if (error) {
      sendErrorToast(t`Failed to update workspace name`);
    } else {
      sendSuccessToast(t`Workspace name updated`);
    }
  };

  return (
    <PaneHeaderInput initialValue={workspace.name} onChange={handleChange} />
  );
}
