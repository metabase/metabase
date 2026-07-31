import { t } from "ttag";

import { Modal } from "metabase/ui";
import { useDisableMfaMutation } from "metabase-enterprise/api";

import { ConfirmCodeForm } from "../ConfirmCodeForm";

type DisableModalProps = {
  opened: boolean;
  onSuccess: () => void;
  onCancel: () => void;
};

export function DisableModal({
  opened,
  onSuccess,
  onCancel,
}: DisableModalProps) {
  return (
    <Modal
      title={t`Disable two-factor authentication`}
      opened={opened}
      onClose={onCancel}
    >
      <DisableForm onSuccess={onSuccess} onCancel={onCancel} />
    </Modal>
  );
}

type DisableFormProps = {
  onSuccess: () => void;
  onCancel: () => void;
};

function DisableForm({ onSuccess, onCancel }: DisableFormProps) {
  const [disableMfa] = useDisableMfaMutation();

  const handleSubmit = async (code: string) => {
    await disableMfa({ code }).unwrap();
    onSuccess();
  };

  return (
    <ConfirmCodeForm
      message={t`Are you sure you want to disable two-factor authentication? Your account will be protected by your password only, and your recovery codes will stop working.`}
      submitLabel={t`Disable`}
      submitColor="error"
      onSubmit={handleSubmit}
      onCancel={onCancel}
    />
  );
}
