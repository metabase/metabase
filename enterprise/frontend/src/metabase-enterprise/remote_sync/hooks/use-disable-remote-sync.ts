import { useCallback } from "react";
import { t } from "ttag";

import { useToast } from "metabase/common/hooks";
import { useConfirmation } from "metabase/common/hooks/use-confirmation";
import { useUpdateRemoteSyncSettingsMutation } from "metabase-enterprise/api/remote-sync";

import { trackRemoteSyncDeactivated } from "../analytics";
import { URL_KEY } from "../constants";

export const useDisableRemoteSync = () => {
  const [updateRemoteSyncSettings, { isLoading: isDisabling }] =
    useUpdateRemoteSyncSettingsMutation();
  const [sendToast] = useToast();
  const { show: showDisableConfirmation, modalContent: disableModal } =
    useConfirmation();

  const handleDisable = useCallback(async () => {
    showDisableConfirmation({
      title: t`Disable Remote Sync?`,
      message: t`This will clear all remote sync settings. Any changes made to the Library collection after disabling can be overwritten if you enable sync again.`,
      confirmButtonText: t`Disable`,
      confirmButtonProps: {
        variant: "filled",
        color: "feedback-negative",
      },
      onConfirm: async () => {
        try {
          await updateRemoteSyncSettings({ [URL_KEY]: "" }).unwrap();
          trackRemoteSyncDeactivated();
          sendToast({ message: t`Remote Sync disabled`, icon: "check" });
        } catch (error) {
          console.error(error);
          sendToast({
            message: t`Failed to disable Remote Sync`,
            icon: "warning",
          });
        }
      },
    });
  }, [updateRemoteSyncSettings, sendToast, showDisableConfirmation]);

  return { handleDisable, disableModal, isDisabling };
};
