import React from "react";

import Modal from "metabase/components/Modal";
import ModalContent from "metabase/components/ModalContent";

interface Props {
  onClose: () => void;
  title: string;
  children: React.ReactElement;
}

export default function ActionParametersInputModal({
  onClose,
  title,
  children,
}: Props) {
  return (
    <Modal onClose={onClose}>
      <ModalContent title={title} onClose={onClose}>
        {children}
      </ModalContent>
    </Modal>
  );
}
