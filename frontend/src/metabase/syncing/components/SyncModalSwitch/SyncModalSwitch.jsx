import React, { useCallback, useEffect, useState } from "react";
import { connect } from "react-redux";
import PropTypes from "prop-types";
import _ from "underscore";
import Modal from "metabase/components/Modal";
import Databases from "metabase/entities/databases";
import SyncModal from "metabase/syncing/components/SyncModal";
import { disableSyncingModal } from "metabase/syncing/actions";
import {
  hasSyncingDatabases,
  hasSyncingModalEnabled,
} from "metabase/syncing/selectors";

const propTypes = {
  isSyncing: PropTypes.bool,
  hasSyncingModalEnabled: PropTypes.bool,
  onOpen: PropTypes.func,
};

export const SyncModalSwitch = ({
  isSyncing,
  hasSyncingModalEnabled,
  onOpen,
}) => {
  const [isOpened, setIsOpened] = useState(false);

  const handleClose = useCallback(() => {
    setIsOpened(false);
  }, []);

  useEffect(() => {
    if (isSyncing && hasSyncingModalEnabled) {
      setIsOpened(true);
      onOpen && onOpen();
    }
  }, [isSyncing, hasSyncingModalEnabled, onOpen]);

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
      hasSyncingModalEnabled: hasSyncingModalEnabled(state),
    }),
    {
      onOpen: disableSyncingModal,
    },
  ),
)(SyncModalSwitch);
