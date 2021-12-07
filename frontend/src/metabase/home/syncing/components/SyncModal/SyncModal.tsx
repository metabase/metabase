import React, { useState, useCallback, useEffect } from "react";
import Modal from "metabase/components/Modal";
import SyncModalContent from "../SyncModalContent";
import { Database } from "../../types";

interface Props {
  showModal?: boolean;
  showXrays?: boolean;
  sampleDatabase?: Database;
  onOpen?: () => void;
}

const SyncModal = ({ showModal, showXrays, sampleDatabase, onOpen }: Props) => {
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
      <SyncModalContent
        showXrays={showXrays}
        sampleDatabase={sampleDatabase}
        onClose={handleClose}
      />
    </Modal>
  );
};

export default SyncModal;
