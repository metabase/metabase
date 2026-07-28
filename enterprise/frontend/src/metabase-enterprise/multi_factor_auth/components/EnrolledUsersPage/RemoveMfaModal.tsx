import { t } from "ttag";

import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { useRemoveUserMfaMutation } from "metabase-enterprise/api";
import type { MfaEnrolledUser } from "metabase-types/api";

interface RemoveMfaModalProps {
  user: MfaEnrolledUser;
  onClose: () => void;
}

export const RemoveMfaModal = ({ user, onClose }: RemoveMfaModalProps) => {
  const [removeUserMfa] = useRemoveUserMfaMutation();

  return (
    <ConfirmModal
      opened
      title={t`Remove two-factor authentication for ${user.common_name}?`}
      message={t`They'll lose their authenticator setup and all of their recovery codes, and will need to set two-factor authentication up again. We'll email them to let them know.`}
      confirmButtonText={t`Remove`}
      confirmButtonProps={{ color: "danger" }}
      onClose={onClose}
      onConfirm={async () => {
        await removeUserMfa({ user_id: user.id }).unwrap();
        onClose();
      }}
    />
  );
};
