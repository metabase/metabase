import React, { useState, useEffect, useCallback } from "react";
import { isSyncInProgress } from "metabase/lib/syncing";
import Modal from "metabase/components/Modal";
import ExploreDatabaseModal from "metabase/admin/databases/components/ExploreDatabaseModal";
import { Database, User } from "../../types";

interface Props {
  user: User;
  databases: Database[];
  showXrays?: boolean;
  showExploreModal?: boolean;
  onHideExploreModal?: () => void;
}

const ExploreSection = ({
  user,
  databases,
  showXrays,
  showExploreModal,
  onHideExploreModal,
}: Props) => {
  const isSyncing = hasUserSyncingDatabase(user, databases);
  const [isOpened, setIsOpened] = useState(isSyncing && showExploreModal);
  const sampleDatabase = databases.find(d => d.is_sample);

  const handleClose = useCallback(() => {
    setIsOpened(false);
  }, []);

  useEffect(() => {
    if (isOpened) {
      onHideExploreModal && onHideExploreModal();
    }
  }, [isOpened]);

  return (
    <Modal isOpen={isOpened} full={false} onClose={handleClose}>
      <ExploreDatabaseModal
        sampleDatabase={sampleDatabase}
        showXrays={showXrays}
        onClose={handleClose}
      />
    </Modal>
  );
};

const hasUserSyncingDatabase = (user: User, databases: Database[]): boolean => {
  return databases.some(d => d.creator_id === user.id && isSyncInProgress(d));
};

export default ExploreSection;
