import React, { useCallback, useEffect, useState } from "react";
import { connect } from "react-redux";
import PropTypes from "prop-types";
import _ from "underscore";
import Databases from "metabase/entities/databases";
import Modal from "metabase/components/Modal";
import SyncModal from "../SyncModalContent";
import { disableSyncingModal } from "../../actions";
import { isSyncingModalRequired } from "../../selectors";

const propTypes = {
  isRequired: PropTypes.bool,
  onOpen: PropTypes.func,
};

export const SyncModalSwitch = ({ isRequired, onOpen }) => {
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
      <SyncModal onClose={handleClose} />
    </Modal>
  );
};

SyncModalSwitch.propTypes = propTypes;

export default _.compose(
  Databases.loadList({
    query: { include: "tables" },
  }),
  connect(
    state => ({
      isRequired: isSyncingModalRequired(state),
    }),
    {
      onOpen: disableSyncingModal,
    },
  ),
)(SyncModalSwitch);
