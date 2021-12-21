import React, { useState, useEffect, useCallback } from "react";
import { isSyncInProgress } from "metabase/lib/syncing";
import Modal from "metabase/components/Modal";
import SyncDatabaseModal from "metabase/admin/databases/containers/SyncDatabaseModal";
import { Database, User } from "../../types";

export interface SyncingSectionProps {
  user: User;
  databases: Database[];
  showSyncingModal?: boolean;
  onHideSyncingModal?: () => void;
}

const SyncingSection = ({
  user,
  databases,
  showSyncingModal,
  onHideSyncingModal,
}: SyncingSectionProps): JSX.Element => {
  const isSyncing = isUserSyncingDatabase(user, databases);
  const [isOpened, setIsOpened] = useState(isSyncing && showSyncingModal);

  const handleClose = useCallback(() => {
    setIsOpened(false);
  }, []);

  useEffect(() => {
    if (isOpened) {
      onHideSyncingModal?.();
    }
  }, [isOpened, onHideSyncingModal]);

  return (
    <Modal isOpen={isOpened} full={false} onClose={handleClose}>
      <SyncDatabaseModal onClose={handleClose} />
    </Modal>
  );
};

const isUserSyncingDatabase = (user: User, databases: Database[]): boolean => {
  return databases.some(
    d => !d.is_sample && d.creator_id === user.id && isSyncInProgress(d),
  );
};

export default SyncingSection;
