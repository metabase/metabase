import { jt, t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import { EditableText } from "metabase/common/components/EditableText";
import { Box, Text } from "metabase/ui";
import { getUserName } from "metabase/utils/user";

import type { WorkspaceInfo } from "../../../types";

type WorkspaceHeaderProps = {
  workspace: WorkspaceInfo;
  onNameChange: (name: string) => void;
};

export function WorkspaceHeader({
  workspace,
  onNameChange,
}: WorkspaceHeaderProps) {
  const creatorName =
    workspace.creator != null ? getUserName(workspace.creator) : null;
  const createdAt =
    workspace.created_at != null ? (
      <DateTime key="date" value={workspace.created_at} unit="day" />
    ) : null;

  return (
    <Box data-testid="workspace-header-section">
      <EditableText
        key={workspace.id ?? "new"}
        initialValue={workspace.name}
        placeholder={t`Workspace name`}
        fz="h1"
        fw={700}
        lh={1.2}
        m="-xs"
        bd={workspace.id == null ? "1px solid border" : undefined}
        onChange={onNameChange}
      />
      {createdAt != null && (
        <Text c="text-secondary" maw="40rem">
          {creatorName
            ? jt`Created by ${creatorName} at ${createdAt}`
            : jt`Created at ${createdAt}`}
        </Text>
      )}
    </Box>
  );
}
