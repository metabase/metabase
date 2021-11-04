import React, { useCallback, useEffect, useState } from "react";
import { connect } from "react-redux";
import PropTypes from "prop-types";
import _ from "underscore";
import Modal from "metabase/components/Modal";
import Databases from "metabase/entities/databases";
import SyncModal from "../SyncModal";
import { disableSyncingModal } from "../../actions";
import { hasSyncingDatabases, isSyncingModalEnabled } from "../../selectors";

const propTypes = {
  isSyncing: PropTypes.bool,
  isSyncingModalEnabled: PropTypes.bool,
  onOpen: PropTypes.func,
};

export const SyncModalSwitch = ({
  isSyncing,
  isSyncingModalEnabled,
  onOpen,
}) => {
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
      isSyncing: hasSyncingDatabases(state),
      isSyncingModalEnabled: isSyncingModalEnabled(state),
    }),
    {
      onOpen: disableSyncingModal,
    },
  ),
)(SyncModalSwitch);
