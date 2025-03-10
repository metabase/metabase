import { t } from "ttag";

import { ConfirmModal } from "metabase/components/ConfirmModal/ConfirmModal";

interface Props {
  onConfirm?: () => void;
  onCancel?: () => void;
  onClose?: () => void;
  opened: boolean | undefined;
}

export const LeaveConfirmModal = ({ onConfirm, onClose, opened }: Props) => (
  <ConfirmModal
    opened={opened}
    confirmButtonText={t`Discard changes`}
    data-testid="leave-confirmation"
    message={t`Your changes haven't been saved, so you'll lose them if you navigate away.`}
    title={t`Discard your changes?`}
    onConfirm={onConfirm}
    onClose={onClose}
  />
);
