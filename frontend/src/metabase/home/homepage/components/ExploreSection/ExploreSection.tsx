import React, { Fragment, useState, useEffect, useCallback } from "react";
import { t, jt } from "ttag";
import * as Urls from "metabase/lib/urls";
import { isSyncInProgress } from "metabase/lib/syncing";
import Button from "metabase/components/Button";
import Link from "metabase/components/Link";
import Modal from "metabase/components/Modal";
import ModalContent from "metabase/components/ModalContent";
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
  const [isOpened, setIsOpened] = useState(false);
  const isAdmin = user.is_superuser;
  const isSyncing = databases.some(d => isUserSyncingDatabase(d, user));
  const sampleDatabase = databases.find(d => d.is_sample);

  const handleClose = useCallback(() => {
    setIsOpened(false);
  }, []);

  useEffect(() => {
    if (isAdmin && isSyncing && showExploreModal) {
      setIsOpened(true);
      onHideExploreModal && onHideExploreModal();
    }
  }, [isAdmin, isSyncing, showExploreModal, onHideExploreModal]);

  return (
    <Fragment>
      {isOpened && (
        <ExploreModal
          sampleDatabase={sampleDatabase}
          showXrays={showXrays}
          onClose={handleClose}
        />
      )}
    </Fragment>
  );
};

interface ExploreModalProps {
  sampleDatabase?: Database;
  showXrays?: boolean;
  onClose?: () => void;
}

const ExploreModal = ({
  sampleDatabase,
  showXrays,
  onClose,
}: ExploreModalProps) => {
  return (
    <Modal full={false} onClose={onClose}>
      <ModalContent
        title={t`Great, we're taking a look at your database!`}
        footer={
          sampleDatabase ? (
            <Link to={showXrays ? Urls.exploreDatabase(sampleDatabase) : "/"}>
              <Button primary>{t`Explore sample data`}</Button>
            </Link>
          ) : (
            <Link to="/">
              <Button primary>{t`Explore your Metabase`}</Button>
            </Link>
          )
        }
        onClose={onClose}
      >
        <div>
          <span>
            {t`You’ll be able to use individual tables as they finish syncing. `}
          </span>
          {sampleDatabase ? (
            <span>
              {jt`You can also explore our ${(
                <strong>{sampleDatabase.name}</strong>
              )} in the meantime if you want to get a head start.`}
            </span>
          ) : (
            <span>
              {t`Have a look around your Metabase in the meantime if you want to get a head start.`}
            </span>
          )}
        </div>
      </ModalContent>
    </Modal>
  );
};

const isUserSyncingDatabase = (database: Database, user: User): boolean => {
  return database.creator_id === user.id && isSyncInProgress(database);
};

export default ExploreSection;
