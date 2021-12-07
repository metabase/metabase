import React, { useState, useCallback, useEffect } from "react";
import Modal from "metabase/components/Modal";
import SyncModalContent from "../SyncModalContent";
import { Database } from "../../types";

interface Props {
  sampleDatabase?: Database;
  showModal?: boolean;
  showXrays?: boolean;
  hasSyncingDatabases?: boolean;
  onHideModal?: () => void;
}

const SyncModal = ({
  sampleDatabase,
  showModal,
  showXrays,
  hasSyncingDatabases,
  onHideModal,
}: Props) => {
  const [isOpened, setIsOpened] = useState(false);

  const handleClose = useCallback(() => {
    setIsOpened(false);
  }, []);

  useEffect(() => {
    if (showModal && hasSyncingDatabases) {
      setIsOpened(true);
      onHideModal && onHideModal();
    }
  }, [showModal, hasSyncingDatabases, onHideModal]);

  return (
    <Modal isOpen={isOpened} full={false} onClose={handleClose}>
      <SyncModalContent
        sampleDatabase={sampleDatabase}
        showXrays={showXrays}
        onClose={handleClose}
      />
    </Modal>
  );
};

export default SyncModal;
