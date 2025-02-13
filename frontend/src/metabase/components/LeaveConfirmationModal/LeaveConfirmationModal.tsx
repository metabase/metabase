import { t } from "ttag";

import { ConfirmationModal } from "metabase/components/ConfirmContent/ConfirmationModal";

interface Props {
  onConfirm?: () => void;
  onCancel?: () => void;
  onClose?: () => void;
  opened: boolean | undefined;
}

export const LeaveConfirmationModal = ({
  onConfirm,
  onClose,
  opened,
}: Props) => (
  <ConfirmationModal
    opened={opened}
    confirmButtonText={t`Discard changes`}
    data-testid="leave-confirmation"
    message={t`Your changes haven't been saved, so you'll lose them if you navigate away.`}
    title={t`Discard your changes?`}
    onConfirm={onConfirm}
    onClose={onClose}
  />
);
