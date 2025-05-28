import { t } from "ttag";

import ModalContent from "metabase/components/ModalContent";
import { Modal } from "metabase/ui/components";

interface Props {
  isOpen: boolean;
  value: Map<number, string>; // TODO: does it need to be a Map?
  onChange: (value: Map<number, string>) => void;
  onClose: () => void;
}

export const CustomMappingModal = ({
  isOpen,
  value,
  onChange,
  onClose,
}: Props) => (
  <Modal opened={isOpen} onClose={onClose}>
    <ModalContent title={t`Custom mapping`} onClose={onClose}>
      1
    </ModalContent>
  </Modal>
);
