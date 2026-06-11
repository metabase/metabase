import type { ReactNode } from "react";

import { useEscapeToCloseModal } from "metabase/common/hooks/use-escape-to-close-modal";
import { Modal, type ModalProps } from "metabase/ui";

type ActionModalProps = {
  onClose: () => void;
  // capture lets a modal stacked on top of another close first on Escape
  escapeCapture?: boolean;
  children: ReactNode;
} & Partial<ModalProps>;

export function ActionModal({
  onClose,
  escapeCapture,
  children,
  ...props
}: ActionModalProps) {
  useEscapeToCloseModal(onClose, escapeCapture ? { capture: true } : {});

  return (
    <Modal
      opened
      size="85%"
      padding={0}
      withCloseButton={false}
      closeOnEscape={false}
      onClose={onClose}
      {...props}
    >
      {children}
    </Modal>
  );
}
