import type { ReplaceDataSourceModalProps } from "metabase/plugins";
import { Flex, FocusTrap, Modal } from "metabase/ui";
import type { ReplaceSourceEntry } from "metabase-types/api";

import { ModalBody } from "./ModalBody";
import { ModalFooter } from "./ModalFooter";
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
        <ModalContent source={source} target={target} onClose={onClose} />
      </Modal.Content>
    </Modal.Root>
  );
}

type ModalContentProps = {
  source: ReplaceSourceEntry | undefined;
  target: ReplaceSourceEntry | undefined;
  onClose: () => void;
};

function ModalContent({ source, target, onClose }: ModalContentProps) {
  return (
    <Flex h="100%" direction="column">
      <ModalHeader source={source} target={target} />
      <ModalBody />
      <ModalFooter onClose={onClose} />
    </Flex>
  );
}
