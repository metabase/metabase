import { useCallback } from "react";
import { t } from "ttag";

import { useToast } from "metabase/common/hooks/use-toast";
import { usePushWorkspaceConfigMutation } from "metabase-enterprise/api";
import type { WorkspaceId } from "metabase-types/api";

export function usePushConfigWithToast() {
  const [pushConfig] = usePushWorkspaceConfigMutation();
  const [sendToast] = useToast();

  return useCallback(
    async (workspaceId: WorkspaceId) => {
      await pushConfig(workspaceId).unwrap();
      sendToast({
        message: t`The instance was set up with this workspace`,
        icon: "check",
      });
    },
    [pushConfig, sendToast],
  );
}
