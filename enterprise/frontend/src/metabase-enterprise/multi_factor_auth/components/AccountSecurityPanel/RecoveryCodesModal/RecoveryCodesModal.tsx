import { useState } from "react";
import { jt, t } from "ttag";

import { Box, Modal } from "metabase/ui";
import { useRegenerateRecoveryCodesMutation } from "metabase-enterprise/api";

import { ConfirmCodeForm } from "../ConfirmCodeForm";
import { RecoveryCodesForm } from "../RecoveryCodesForm";

type RecoveryCodesModalProps = {
  opened: boolean;
  onSuccess: () => void;
  onCancel: () => void;
};

export function RecoveryCodesModal({
  opened,
  onSuccess,
  onCancel,
}: RecoveryCodesModalProps) {
  return (
    <Modal
      title={t`Generate recovery codes`}
      opened={opened}
      onClose={onCancel}
    >
      <RecoveryCodesModalBody onSuccess={onSuccess} onCancel={onCancel} />
    </Modal>
  );
}

type RecoveryCodesModalBodyProps = {
  onSuccess: () => void;
  onCancel: () => void;
};

function RecoveryCodesModalBody({
  onSuccess,
  onCancel,
}: RecoveryCodesModalBodyProps) {
  const [regenerateRecoveryCodes] = useRegenerateRecoveryCodesMutation();
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);

  const handleGenerate = async (code: string) => {
    const { recovery_codes } = await regenerateRecoveryCodes({
      code,
    }).unwrap();
    setRecoveryCodes(recovery_codes);
  };

  if (recoveryCodes != null) {
    return (
      <RecoveryCodesForm
        recoveryCodes={recoveryCodes}
        message={jt`Your old recovery codes no longer work. Each new code signs you in once if you lose your authenticator — ${(
          <Box
            component="span"
            key="warning"
            c="text-primary"
            fw="bold"
          >{t`this is the only time they'll be shown.`}</Box>
        )}`}
        onDone={onSuccess}
      />
    );
  }

  return (
    <ConfirmCodeForm
      message={t`This will generate a new set of recovery codes and invalidate all of your old ones.`}
      submitLabel={t`Generate new codes`}
      onSubmit={handleGenerate}
      onCancel={onCancel}
    />
  );
}
