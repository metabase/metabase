import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
} from "react";
import moment, { Moment } from "moment-timezone";
import { isSyncInProgress } from "metabase/lib/syncing";
import Modal from "metabase/components/Modal";
import SyncingModal from "metabase/containers/SyncingModal";
import { Database, User } from "metabase-types/api";

const SYNC_TIMEOUT = 30000;
const CLOCK_TIMEOUT = 5000;

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
  const [isOpened, setIsOpened] = useState(false);
  const isOpening = useSyncingModal(databases, user, showSyncingModal);

  const handleClose = useCallback(() => {
    setIsOpened(false);
  }, []);

  useLayoutEffect(() => {
    if (isOpening) {
      setIsOpened(isOpening);
      onHideSyncingModal?.();
    }
  }, [isOpening, onHideSyncingModal]);

  return (
    <Modal isOpen={isOpened} small full={false} onClose={handleClose}>
      <SyncingModal onClose={handleClose} />
    </Modal>
  );
};

const useClock = (isEnabled: boolean): Moment => {
  const [now, setNow] = useState(() => moment());

  useEffect(() => {
    if (isEnabled) {
      const timeout = setTimeout(() => setNow(moment()), CLOCK_TIMEOUT);
      return () => clearTimeout(timeout);
    }
  }, [now, isEnabled]);

  return now;
};

const useSyncingModal = (
  databases: Database[],
  user: User,
  showSyncingModal = false,
): boolean => {
  const database = getSyncingDatabase(databases, user);
  const isSyncing = database != null;
  const now = useClock(isSyncing);
  const isElapsed = database ? isSyncingForLongTime(database, now) : false;

  return isSyncing && isElapsed && showSyncingModal;
};

const getSyncingDatabase = (
  databases: Database[],
  user: User,
): Database | undefined => {
  return databases.find(
    d => !d.is_sample && d.creator_id === user.id && isSyncInProgress(d),
  );
};

const isSyncingForLongTime = (database: Database, now: Moment): boolean => {
  if (isSyncInProgress(database) && database.timezone) {
    const createdAt = moment.tz(database.created_at, database.timezone);
    return now.diff(createdAt, "ms") > SYNC_TIMEOUT;
  } else {
    return false;
  }
};

export default SyncingSection;
