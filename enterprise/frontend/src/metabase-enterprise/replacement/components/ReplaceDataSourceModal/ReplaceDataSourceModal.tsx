import { Modal } from "metabase/ui";
import type { ReplaceSourceEntry } from "metabase-types/api";

import { ModalHeader } from "./ModalHeader";

type ReplaceDataSourceModalProps = {
  opened: boolean;
  source?: ReplaceSourceEntry;
  target?: ReplaceSourceEntry;
  onClose: () => void;
};

export function ReplaceDataSourceModal({
  opened,
  source,
  target,
  onClose,
}: ReplaceDataSourceModalProps) {
  return (
    <Modal.Root opened={opened} fullScreen onClose={onClose}>
      <Modal.Overlay />
      <Modal.Content>
        <ModalHeader source={source} target={target} />
      </Modal.Content>
    </Modal.Root>
  );
}
