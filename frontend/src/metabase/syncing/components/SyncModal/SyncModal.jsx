import React, { useCallback, useEffect, useState } from "react";
import PropTypes from "prop-types";
import Modal from "metabase/components/Modal";
import SyncModalContent from "../SyncModalContent";

const propTypes = {
  isRequired: PropTypes.bool,
  onOpen: PropTypes.func,
};

const SyncModal = ({ isRequired, onOpen }) => {
  const [isOpened, setIsOpened] = useState(false);

  const handleClose = useCallback(() => {
    setIsOpened(false);
  }, []);

  useEffect(() => {
    if (isRequired) {
      setIsOpened(true);
      onOpen && onOpen();
    }
  }, [isRequired, onOpen]);

  return (
    <Modal isOpen={isOpened} onClose={handleClose}>
      <SyncModalContent onClose={handleClose} />
    </Modal>
  );
};

SyncModal.propTypes = propTypes;

export default SyncModal;
