import React, { useState, useCallback, useEffect } from "react";
import Modal from "metabase/components/Modal";
import SyncModalContent from "../SyncModalContent";
import { Database } from "../../types";

interface Props {
  databases: Database[];
  showModal?: boolean;
  showXrays?: boolean;
  onHideModal?: () => void;
}

const SyncModal = ({ databases, showModal, showXrays, onHideModal }: Props) => {
  const [isOpened, setIsOpened] = useState(false);

  const handleClose = useCallback(() => {
    setIsOpened(false);
  }, []);

  useEffect(() => {
    if (showModal) {
      setIsOpened(true);
      onHideModal && onHideModal();
    }
  }, [showModal, onHideModal]);

  return (
    <Modal isOpen={isOpened} full={false} onClose={handleClose}>
      <SyncModalContent
        databases={databases}
        showXrays={showXrays}
        onClose={handleClose}
      />
    </Modal>
  );
};

export default SyncModal;
