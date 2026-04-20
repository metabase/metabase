import { t } from "ttag";

import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { useEnableAdvancedAIControlsPermissionsMutation } from "metabase-enterprise/api";

type Props = {
  onClose: () => void;
};

export function EnableAdvancedModal({ onClose }: Props) {
  const [enableAdvanced, { isLoading: loading }] =
    useEnableAdvancedAIControlsPermissionsMutation();
  const { sendErrorToast } = useMetadataToasts();

  const handleConfirm = async () => {
    try {
      await enableAdvanced().unwrap();
      onClose();
    } catch {
      sendErrorToast(t`Failed to switch to group-level permissions`);
    }
  };

  return (
    <ConfirmModal
      opened
      onClose={onClose}
      title={t`Switch to group-level permissions?`}
      message={t`This will remove all AI feature access from the "All Users" group, so users won't have access to AI features unless they're added to a group that has access.`}
      confirmButtonText={t`Switch to group-level permissions`}
      confirmButtonProps={{
        color: "brand",
        variant: "filled",
        loading,
      }}
      closeButtonProps={{ disabled: loading }}
      onConfirm={handleConfirm}
    />
  );
}
