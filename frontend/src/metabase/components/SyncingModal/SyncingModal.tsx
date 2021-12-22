import React from "react";
import { jt, t } from "ttag";
import Link from "metabase/components/Link";
import {
  ModalMessage,
  ModalIllustration,
  ModalRoot,
  ModalTitle,
  ModalBody,
  ModalCloseIcon,
} from "./SyncingModal.styled";

export interface SyncingModalProps {
  sampleUrl?: string;
  onClose?: () => void;
}

const SyncingModal = ({ sampleUrl, onClose }: SyncingModalProps) => {
  return (
    <ModalRoot>
      <ModalBody>
        <ModalIllustration
          src="app/img/syncing-illustration.svg"
          width={148}
          height={109}
        />
        <ModalTitle>{t`We're taking a look at your database!`}</ModalTitle>
        <ModalMessage>
          {t`You’ll be able to use individual tables as they finish syncing.`}{" "}
          {sampleUrl
            ? jt`In the meantime, you can take a look at the ${(
                <strong key="name">{t`Sample Dataset`}</strong>
              )} if you want to get a head start. Want to explore?`
            : t`Have a look around your Metabase in the meantime if you want to get a head start.`}
        </ModalMessage>
        <Link
          className="Button Button--primary"
          to={sampleUrl ? sampleUrl : "/"}
          onClick={onClose}
        >
          {sampleUrl ? t`Explore sample data` : t`Explore your Metabase`}
        </Link>
      </ModalBody>
      {onClose && <ModalCloseIcon name="close" onClick={onClose} />}
    </ModalRoot>
  );
};

export default SyncingModal;
