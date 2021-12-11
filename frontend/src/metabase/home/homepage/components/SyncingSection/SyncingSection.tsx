import React, { useState, useEffect, useCallback } from "react";
import { isSyncInProgress } from "metabase/lib/syncing";
import Modal from "metabase/components/Modal";
import SyncDatabaseModal from "metabase/admin/databases/components/SyncDatabaseModal";
import { Database, User } from "../../types";

interface Props {
  user: User;
  databases: Database[];
  showXrays?: boolean;
  showSyncingModal?: boolean;
  onHideSyncingModal?: () => void;
}

const SyncingSection = ({
  user,
  databases,
  showXrays,
  showSyncingModal,
  onHideSyncingModal,
}: Props) => {
  const isSyncing = isUserSyncingDatabase(user, databases);
  const [isOpened, setIsOpened] = useState(isSyncing && showSyncingModal);
  const sampleDatabase = databases.find(d => d.is_sample);

  const handleClose = useCallback(() => {
    setIsOpened(false);
  }, []);

  useEffect(() => {
    if (isOpened) {
      onHideSyncingModal && onHideSyncingModal();
    }
  }, [isOpened, onHideSyncingModal]);

  return (
    <Modal isOpen={isOpened} full={false} onClose={handleClose}>
      <SyncDatabaseModal
        sampleDatabase={sampleDatabase}
        showXrays={showXrays}
        onClose={handleClose}
      />
    </Modal>
  );
};

const isUserSyncingDatabase = (user: User, databases: Database[]): boolean => {
  return databases.some(
    d => !d.is_sample && d.creator_id === user.id && isSyncInProgress(d),
  );
};

export default SyncingSection;
