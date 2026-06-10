import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { hasWorkspacesEnabled } from "metabase/common/utils/database";
import { Box, Button, Icon, Tooltip } from "metabase/ui";
import type { Database, WorkspaceInstance } from "metabase-types/api";

import { CreateWorkspaceModal } from "../CreateWorkspaceModal";

type WorkspaceCreationCheck = {
  valid: boolean;
  message?: string;
};

function checkCanCreateWorkspace(
  databases: Database[],
  workspaceInstances: WorkspaceInstance[],
): WorkspaceCreationCheck {
  if (!databases.some(hasWorkspacesEnabled)) {
    return {
      valid: false,
      message: t`Enable workspaces for at least one database first.`,
    };
  }
  if (!workspaceInstances.some((instance) => instance.workspace_id == null)) {
    return {
      valid: false,
      message: t`All developer instances are in use. Add another instance first.`,
    };
  }
  return { valid: true };
}

type CreateWorkspaceButtonProps = {
  databases: Database[];
  workspaceInstances: WorkspaceInstance[];
  primary?: boolean;
};

export function CreateWorkspaceButton({
  databases,
  workspaceInstances,
  primary,
}: CreateWorkspaceButtonProps) {
  const [
    createModalOpened,
    { open: openCreateModal, close: closeCreateModal },
  ] = useDisclosure(false);
  const { valid, message } = checkCanCreateWorkspace(
    databases,
    workspaceInstances,
  );

  return (
    <>
      <Tooltip label={message} disabled={valid}>
        <Box>
          <Button
            variant={primary ? "filled" : "default"}
            leftSection={primary ? undefined : <Icon name="add" />}
            disabled={!valid}
            onClick={openCreateModal}
          >
            {primary ? t`Create a workspace` : t`Create`}
          </Button>
        </Box>
      </Tooltip>
      <CreateWorkspaceModal
        opened={createModalOpened}
        onClose={closeCreateModal}
        onCreate={closeCreateModal}
      />
    </>
  );
}
