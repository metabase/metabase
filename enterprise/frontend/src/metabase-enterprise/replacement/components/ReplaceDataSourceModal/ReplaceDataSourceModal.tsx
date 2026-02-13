import type { ReplaceDataSourceModalProps } from "metabase/plugins";
import { Modal } from "metabase/ui";

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
        <ModalHeader source={source} target={target} />
      </Modal.Content>
    </Modal.Root>
  );
}
