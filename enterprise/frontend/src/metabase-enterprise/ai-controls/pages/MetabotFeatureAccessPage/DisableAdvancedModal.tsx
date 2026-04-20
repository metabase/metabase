import { t } from "ttag";

import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { useDisableAdvancedAIControlsPermissionsMutation } from "metabase-enterprise/api";

type Props = {
  opened: boolean;
  onClose: () => void;
};

export function DisableAdvancedModal({ opened, onClose }: Props) {
  const [disableAdvanced] = useDisableAdvancedAIControlsPermissionsMutation();
  const { sendErrorToast } = useMetadataToasts();

  const handleConfirm = async () => {
    try {
      await disableAdvanced().unwrap();
      onClose();
    } catch {
      sendErrorToast(t`Failed to remove group-level access`);
    }
  };

  return (
    <ConfirmModal
      opened={opened}
      onClose={onClose}
      title={t`Remove group-level access?`}
      message={t`If you don't need to set access granularly for each group, you can switch back to controlling access via just the "All Users" group. This will remove access from all of your other groups.`}
      confirmButtonText={t`Remove access from all groups`}
      onConfirm={handleConfirm}
    />
  );
}
