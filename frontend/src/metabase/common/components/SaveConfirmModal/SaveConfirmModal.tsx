import { t } from "ttag";
import _ from "underscore";

import { ConfirmModal } from "metabase/common/components/ConfirmModal/ConfirmModal";

interface Props {
  onConfirm?: () => void;
  onDiscard?: () => void;
  onClose?: () => void;
  opened: boolean | undefined;
}

export const SaveConfirmModal = ({
  onConfirm,
  onDiscard,
  onClose,
  opened,
}: Props) => (
  <ConfirmModal
    opened={Boolean(opened)}
    confirmButtonText={t`Save changes`}
    discardButtonText={t`Discard changes`}
    data-testid="save-confirmation"
    message={t`Your changes haven't been saved, you'll lose them if you navigate away.`}
    title={t`Save your changes?`}
    onConfirm={onConfirm}
    onDiscard={onDiscard}
    onClose={onClose ?? _.noop}
  />
);
