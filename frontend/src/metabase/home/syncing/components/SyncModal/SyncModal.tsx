import React, { useState, useCallback, useEffect } from "react";
import { t, jt } from "ttag";
import Button from "metabase/components/Button";
import Link from "metabase/components/Link";
import Modal from "metabase/components/Modal";
import ModalContent from "metabase/components/ModalContent";
import { Database } from "../../types";

interface Props {
  showModal?: boolean;
  showXrays?: boolean;
  sampleDatabase?: Database;
  onOpen?: () => void;
}

const SyncModal = ({ showModal, showXrays, sampleDatabase, onOpen }: Props) => {
  const [isOpened, setIsOpened] = useState(false);

  const handleClose = useCallback(() => {
    setIsOpened(false);
  }, []);

  useEffect(() => {
    if (showModal) {
      setIsOpened(true);
      onOpen && onOpen();
    }
  }, [showModal, onOpen]);

  return (
    <Modal isOpen={isOpened} full={false} onClose={handleClose}>
      <SyncModalContent
        sampleDatabase={sampleDatabase}
        showXrays={showXrays}
        onClose={handleClose}
      />
    </Modal>
  );
};

interface SyncModalContentProps {
  showXrays?: boolean;
  sampleDatabase?: Database;
  onClose?: () => void;
}

export const SyncModalContent = ({
  sampleDatabase,
  showXrays,
  onClose,
}: SyncModalContentProps) => {
  return (
    <ModalContent
      title={t`Great, we're taking a look at your database!`}
      footer={
        sampleDatabase ? (
          <Link to={showXrays ? `/explore/${sampleDatabase.id}` : "/"}>
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
  );
};

export default SyncModal;
