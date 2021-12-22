import React from "react";
import { jt, t } from "ttag";
import Button from "metabase/components/Button";
import ModalContent from "metabase/components/ModalContent";
import Link from "metabase/components/Link";

export interface SyncingModalProps {
  sampleUrl?: string;
  onClose?: () => void;
}

const SyncingModal = ({ sampleUrl, onClose }: SyncingModalProps) => {
  return (
    <ModalContent
      title={t`We're taking a look at your database!`}
      footer={
        <Link to={sampleUrl ? sampleUrl : "/"}>
          <Button primary onClick={onClose}>
            {sampleUrl ? t`Explore sample data` : t`Explore your Metabase`}
          </Button>
        </Link>
      }
      onClose={onClose}
    >
      <div>
        <span>
          {t`You’ll be able to use individual tables as they finish syncing.`}{" "}
        </span>
        {sampleUrl ? (
          <span>
            {jt`In the meantime, you can take a look at the ${(
              <strong key="name">{t`Sample Dataset`}</strong>
            )} if you want to get a head start. Want to explore?`}
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

export default SyncingModal;
