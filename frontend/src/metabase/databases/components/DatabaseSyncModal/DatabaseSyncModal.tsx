import cx from "classnames";
import { jt, t } from "ttag";

import Button from "metabase/core/components/Button";
import Link from "metabase/core/components/Link";
import ButtonsS from "metabase/css/components/buttons.module.css";

import {
  ModalMessage,
  ModalIllustration,
  ModalRoot,
  ModalTitle,
  ModalBody,
  ModalCloseIcon,
} from "./DatabaseSyncModal.styled";

export interface DatabaseSyncModalProps {
  sampleUrl?: string;
  onClose?: () => void;
}

const DatabaseSyncModal = ({ sampleUrl, onClose }: DatabaseSyncModalProps) => {
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
                <strong key="name">{t`Sample Database`}</strong>
              )} if you want to get a head start. Want to explore?`
            : // eslint-disable-next-line no-literal-metabase-strings -- Torch settings
              t`Have a look around your Torch in the meantime if you want to get a head start.`}
        </ModalMessage>
        {sampleUrl ? (
          <Link
            className={cx(ButtonsS.Button, ButtonsS.ButtonPrimary)}
            to={sampleUrl}
          >
            {t`Explore sample data`}
          </Link>
        ) : (
          <Button primary onClick={onClose}>
            {t`Got it`}
          </Button>
        )}
      </ModalBody>
      {onClose && <ModalCloseIcon name="close" onClick={onClose} />}
    </ModalRoot>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DatabaseSyncModal;
