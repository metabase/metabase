import { useCallback } from "react";
import { t } from "ttag";

import { useMetadataToasts } from "metabase/metadata/hooks";
import { Button, Icon, Menu } from "metabase/ui";
import { useExecuteWorkspaceMutation } from "metabase-enterprise/api";
import type { WorkspaceId } from "metabase-types/api";

type RunWorkspaceMenuProps = {
  workspaceId: WorkspaceId;
  disabled?: boolean;
};

export function RunWorkspaceMenu({
  workspaceId,
  disabled = false,
}: RunWorkspaceMenuProps) {
  const { sendErrorToast } = useMetadataToasts();
  const [executeWorkspace, { isLoading: isExecuting }] =
    useExecuteWorkspaceMutation();

  const handleExecuteWorkspace = useCallback(
    async ({ staleOnly } = { staleOnly: false }) => {
      try {
        await executeWorkspace({
          id: workspaceId,
          stale_only: staleOnly,
        }).unwrap();
      } catch (error) {
        sendErrorToast(t`Failed to run transforms`);
      }
    },
    [workspaceId, executeWorkspace, sendErrorToast],
  );

  return (
    <Menu position="bottom-end">
      <Menu.Target>
        <Button
          variant="default"
          rightSection={<Icon name="chevrondown" />}
          loading={isExecuting}
          disabled={disabled}
          size="xs"
        >
          {t`Run transforms`}
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item onClick={() => handleExecuteWorkspace()}>
          {t`Run all transforms`}
        </Menu.Item>
        <Menu.Item onClick={() => handleExecuteWorkspace({ staleOnly: true })}>
          {t`Run stale transforms`}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
