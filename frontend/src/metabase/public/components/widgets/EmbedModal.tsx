import { t } from "ttag";
import Modal from "metabase/components/Modal";
import type { WindowModalProps } from "metabase/components/Modal/WindowModal";
import { Box } from "metabase/ui";

export const EmbedModal = ({
  children,
  enabled,
  onClose,
  embedType,
  ...modalProps
}: {
  enabled?: boolean;
  onClose: () => void;
  children: JSX.Element;
  embedType: string;
} & WindowModalProps) => {
  return (
    <Modal
      isOpen={enabled}
      onClose={onClose}
      title={t`Embed Metabase`}
      fit={embedType !== "application"}
      full={embedType === "application"}
      formModal={false}
      {...modalProps}
    >
      <Box bg="bg.0" h="100%">
        {children}
      </Box>
    </Modal>
  );
};
