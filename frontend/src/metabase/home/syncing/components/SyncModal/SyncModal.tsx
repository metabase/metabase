import React, { useState, useCallback, useEffect } from "react";
import Modal from "metabase/components/Modal";
import SyncModalContent from "../SyncModalContent";

interface Props {
  showModal?: boolean;
  onOpen?: () => void;
}

const SyncModal = ({ showModal, onOpen }: Props) => {
  const [isOpened, setIsOpened] = useState(false);

  const handleClose = useCallback(() => {
    setIsOpened(false);
  }, []);

  useEffect(() => {
    if (showModal) {
      setIsOpened(true);
      onOpen && onOpen();
    }
  }, [showModal, onOpen]);

  return (
    <Modal isOpen={isOpened} full={false} onClose={handleClose}>
      <SyncModalContent onClose={handleClose} />
    </Modal>
  );
};

export default SyncModal;
