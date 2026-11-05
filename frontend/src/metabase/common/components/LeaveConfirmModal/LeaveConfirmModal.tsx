import { noop } from "es-toolkit";
import { t } from "ttag";

import { ConfirmModal } from "metabase/common/components/ConfirmModal/ConfirmModal";

interface Props {
  onConfirm?: () => void;
  onClose?: () => void;
  opened: boolean | undefined;
}

export const LeaveConfirmModal = ({ onConfirm, onClose, opened }: Props) => (
  <ConfirmModal
    opened={Boolean(opened)}
    confirmButtonText={t`Discard changes`}
    data-testid="leave-confirmation"
    message={t`Your changes haven't been saved, so you'll lose them if you navigate away.`}
    title={t`Discard your changes?`}
    onConfirm={onConfirm}
    onClose={onClose ?? noop}
  />
);
