import { t } from "ttag";

import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { Text } from "metabase/ui";

import type { SwitchAdvancedMode } from "../../types";

type Props = {
  loading: boolean;
  onConfirm: SwitchAdvancedMode;
  onClose: () => void;
};

export function DisableAdvancedModal({ loading, onConfirm, onClose }: Props) {
  const handleConfirm = async () => {
    if (await onConfirm()) {
      onClose();
    }
  };

  return (
    <ConfirmModal
      opened
      onClose={onClose}
      title={t`Remove group-level access?`}
      message={
        <>
          {t`If you don't need to set access granularly for each group, you can switch back to controlling access via just the "All Users" group.`}{" "}
          <Text fw="bold" component="strong" display="inline">
            {t`This will remove access from all of your other groups.`}
          </Text>
        </>
      }
      confirmButtonText={t`Remove access from all groups`}
      confirmButtonProps={{ loading }}
      closeButtonProps={{ disabled: loading, variant: "subtle" }}
      onConfirm={handleConfirm}
    />
  );
}
