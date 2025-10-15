import { t } from "ttag";

import { ConfirmModal } from "metabase/common/components/ConfirmModal";

interface PasteQueryModalProps {
  opened: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export const PasteQueryModal = ({
  opened,
  onConfirm,
  onClose,
}: PasteQueryModalProps): React.JSX.Element => {
  return (
    <ConfirmModal
      opened={opened}
      onConfirm={onConfirm}
      onClose={onClose}
      title={t`Replace current question with pasted query?`}
      message={t`This will replace your current question's query. This action cannot be undone.`}
      confirmButtonText={t`Replace Query`}
      confirmButtonProps={{ color: "brand", variant: "filled" }}
      closeButtonText={t`Cancel`}
    />
  );
};
