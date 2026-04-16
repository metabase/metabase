import { useCallback } from "react";
import { t } from "ttag";

import { useMetadataToasts } from "metabase/metadata/hooks";
import { Button, Icon, Menu } from "metabase/ui";
import { useRunWorkspaceMutation } from "metabase-enterprise/api";
import type { WorkspaceId } from "metabase-types/api";

type RunWorkspaceMenuProps = {
  workspaceId: WorkspaceId;
  disabled?: boolean;
};

export function RunWorkspaceMenu({
  workspaceId,
  disabled = false,
}: RunWorkspaceMenuProps) {
  const { sendErrorToast, sendSuccessToast } = useMetadataToasts();
  const [runWorkspace, { isLoading: isRunning }] = useRunWorkspaceMutation();

  const handleRunWorkspace = useCallback(
    async ({ staleOnly } = { staleOnly: false }) => {
      try {
        const response = await runWorkspace({
          id: workspaceId,
          stale_only: staleOnly,
        }).unwrap();

        if (response.failed.length > 0) {
          sendErrorToast(t`Some transforms failed to run`);
        } else if (response.succeeded.length > 0) {
          sendSuccessToast(t`Transforms ran successfully`);
        } else {
          sendSuccessToast(t`No transforms were run`);
        }
      } catch (error) {
        sendErrorToast(t`Failed to run transforms`);
      }
    },
    [workspaceId, runWorkspace, sendErrorToast, sendSuccessToast],
  );

  return (
    <Menu position="bottom-end">
      <Menu.Target>
        <Button
          data-testid="run-all-button"
          disabled={disabled}
          loading={isRunning}
          rightSection={<Icon name="chevrondown" />}
          size="xs"
          variant="default"
        >
          {t`Run transforms`}
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item onClick={() => handleRunWorkspace()}>
          {t`Run all transforms`}
        </Menu.Item>
        <Menu.Item onClick={() => handleRunWorkspace({ staleOnly: true })}>
          {t`Run stale transforms`}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
