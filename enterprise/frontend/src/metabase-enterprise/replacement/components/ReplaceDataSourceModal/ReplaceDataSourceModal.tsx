import type { ReplaceDataSourceModalProps } from "metabase/plugins";
import { FocusTrap, Modal } from "metabase/ui";

import { ModalHeader } from "./ModalHeader";

export function ReplaceDataSourceModal({
  source,
  target,
  isOpened,
  onClose,
}: ReplaceDataSourceModalProps) {
  return (
    <Modal.Root opened={isOpened} fullScreen onClose={onClose}>
      <Modal.Overlay />
      <Modal.Content>
        <FocusTrap.InitialFocus />
        <ModalHeader source={source} target={target} />
      </Modal.Content>
    </Modal.Root>
  );
}
