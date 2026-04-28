import { jt, t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import { EditableText } from "metabase/common/components/EditableText";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Box, Text } from "metabase/ui";
import { getUserName } from "metabase/utils/user";
import { useUpdateWorkspaceMutation } from "metabase-enterprise/api";
import type { Workspace } from "metabase-types/api";

type WorkspaceHeaderProps = {
  workspace: Workspace;
};

export function WorkspaceHeader({ workspace }: WorkspaceHeaderProps) {
  const [updateWorkspace] = useUpdateWorkspaceMutation();
  const { sendErrorToast } = useMetadataToasts();
  const creatorName = workspace.creator ? getUserName(workspace.creator) : null;
  const date = <DateTime key="date" value={workspace.created_at} unit="day" />;

  const handleNameChange = async (name: string) => {
    if (name === workspace.name) {
      return;
    }
    const { error } = await updateWorkspace({ id: workspace.id, name });
    if (error) {
      sendErrorToast(t`Failed to update workspace name`);
    }
  };

  return (
    <Box data-testid="workspace-header-section">
      <EditableText
        key={workspace.id}
        initialValue={workspace.name}
        placeholder={t`Workspace name`}
        fz="h1"
        fw={700}
        lh={1.2}
        m="-xs"
        onChange={handleNameChange}
      />
      <Text c="text-secondary" maw="40rem">
        {creatorName
          ? jt`Created by ${creatorName} at ${date}`
          : jt`Created at ${date}`}
      </Text>
    </Box>
  );
}
