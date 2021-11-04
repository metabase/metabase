import React, { useCallback, useEffect, useState } from "react";
import PropTypes from "prop-types";
import Modal from "metabase/components/Modal";
import SyncFormApp from "../../containers/SyncModal";

const propTypes = {
  isSyncing: PropTypes.bool,
  isSyncingModalEnabled: PropTypes.bool,
  onOpen: PropTypes.func,
};

const SyncModalSwitch = ({ isSyncing, isSyncingModalEnabled, onOpen }) => {
  const [isOpened, setIsOpened] = useState(false);

  const handleClose = useCallback(() => {
    setIsOpened(false);
  }, []);

  useEffect(() => {
    if (isSyncing && isSyncingModalEnabled) {
      setIsOpened(true);
      onOpen && onOpen();
    }
  }, [isSyncing, isSyncingModalEnabled, onOpen]);

  return (
    <Modal isOpen={isOpened} onClose={handleClose}>
      <SyncFormApp onClose={handleClose} />
    </Modal>
  );
};

SyncModalSwitch.propTypes = propTypes;

export default SyncModalSwitch;
