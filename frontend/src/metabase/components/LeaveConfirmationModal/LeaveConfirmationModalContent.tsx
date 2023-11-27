import { t } from "ttag";

import ConfirmContent from "metabase/components/ConfirmContent";

interface Props {
  onAction?: () => void;
  onCancel?: () => void;
  onClose?: () => void;
}

export const LeaveConfirmationModalContent = ({
  onAction,
  onCancel,
  onClose,
}: Props) => (
  <ConfirmContent
    cancelButtonText={t`Cancel`}
    confirmButtonText={t`Discard changes`}
    data-testid="leave-confirmation"
    message={t`Your changes haven't been saved, so you'll lose them if you navigate away.`}
    title={t`Discard your changes?`}
    onAction={onAction}
    onCancel={onCancel}
    onClose={onClose}
  />
);
