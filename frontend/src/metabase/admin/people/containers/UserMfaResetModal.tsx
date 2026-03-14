import { useState } from "react";
import { t } from "ttag";

import { useGetUserQuery } from "metabase/api";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useToast } from "metabase/common/hooks/use-toast";
import { MfaApi } from "metabase/services";

interface UserMfaResetModalProps {
  params: { userId?: string };
  onClose: () => void;
}

export const UserMfaResetModal = ({
  params,
  onClose,
}: UserMfaResetModalProps) => {
  const userId = parseInt(params.userId ?? "", 10);
  const {
    data: user,
    isLoading,
    error,
  } = useGetUserQuery(userId, { skip: isNaN(userId) });
  const [sendToast] = useToast();
  const [confirmError, setConfirmError] = useState<string | null>(null);

  if (isNaN(userId)) {
    onClose();
    return null;
  }

  const handleConfirm = async () => {
    try {
      await MfaApi.adminReset({ id: userId });
      sendToast({
        message: t`Two-factor authentication has been reset for ${user?.common_name}.`,
      });
      onClose();
    } catch (e: unknown) {
      const err = e as { data?: { message?: string } };
      setConfirmError(
        err?.data?.message ?? t`Failed to reset two-factor authentication.`,
      );
    }
  };

  return (
    <LoadingAndErrorWrapper loading={isLoading} error={error}>
      {user && (
        <ConfirmModal
          opened
          title={t`Reset two-factor authentication for ${user.common_name}?`}
          onClose={onClose}
          confirmButtonText={t`Reset MFA`}
          confirmButtonProps={{ color: "danger", variant: "filled" }}
          onConfirm={handleConfirm}
          message={
            confirmError ??
            t`This will remove their authenticator app enrollment and recovery codes. They will need to set up two-factor authentication again on their next login.`
          }
        />
      )}
    </LoadingAndErrorWrapper>
  );
};
