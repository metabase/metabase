import { t } from "ttag";
import Modal from "metabase/components/Modal";
import type { WindowModalProps } from "metabase/components/Modal/WindowModal";
import { Box } from "metabase/ui";

export const EmbedModalWrapper = ({
  children,
  enabled,
  onClose,
  ...modalProps
}: {
  enabled?: boolean;
  onClose: () => void;
  children: JSX.Element;
} & WindowModalProps) => {
  return (
    <Modal
      isOpen={enabled}
      onClose={onClose}
      title={t`Embed Metabase`}
      fit
      formModal={false}
      {...modalProps}
    >
      <Box bg="bg.0">{children}</Box>
    </Modal>
  );
};
