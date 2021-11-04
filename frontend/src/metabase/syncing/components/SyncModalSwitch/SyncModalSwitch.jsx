import React, { useCallback, useEffect, useState } from "react";
import PropTypes from "prop-types";
import Modal from "metabase/components/Modal";
import SyncFormApp from "../../containers/SyncModal";

const propTypes = {
  isSyncing: PropTypes.bool,
  isInitialSync: PropTypes.bool,
  onInitialSyncChange: PropTypes.func,
};

const SyncModalSwitch = ({ isSyncing, isInitialSync, onInitialSyncChange }) => {
  const [isOpened, setIsOpened] = useState(false);

  const handleClose = useCallback(() => {
    setIsOpened(false);
  }, []);

  useEffect(() => {
    if (isSyncing && isInitialSync) {
      setIsOpened(true);
      onInitialSyncChange && onInitialSyncChange(false);
    }
  }, [isSyncing, isInitialSync, onInitialSyncChange]);

  return (
    <Modal isOpen={isOpened} onClose={handleClose}>
      <SyncFormApp onClose={handleClose} />
    </Modal>
  );
};

SyncModalSwitch.propTypes = propTypes;

export default SyncModalSwitch;
