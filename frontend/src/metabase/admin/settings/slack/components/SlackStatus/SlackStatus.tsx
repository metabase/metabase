import React, { ComponentType, useState } from "react";
import { jt, t } from "ttag";
import Button from "metabase/components/Button";
import ExternalLink from "metabase/components/ExternalLink";
import Modal from "metabase/components/Modal";
import SlackBadge from "../SlackBadge";
import SlackButton from "../SlackButton";
import SlackDeleteModal from "../SlackDeleteModal";
import {
  StatusFooter,
  StatusHeader,
  StatusMessage,
  StatusMessageText,
  StatusPrimary,
  StatusRoot,
  StatusSecondary,
  StatusTitle,
} from "./SlackStatus.styled";

export interface SlackStatusProps {
  StatusForm: ComponentType;
  hasSlackError: boolean;
  onDelete: () => void;
}

const SlackStatus = ({
  StatusForm,
  hasSlackError,
  onDelete,
}: SlackStatusProps): JSX.Element => {
  const [isOpened, setIsOpened] = useState(false);
  const handleOpen = () => setIsOpened(true);
  const handleClose = () => setIsOpened(false);

  return (
    <StatusRoot>
      <StatusHeader>
        <StatusPrimary>
          <StatusTitle>{t`Metabase on Slack`}</StatusTitle>
          <StatusMessage>
            <SlackBadge hasSlackError={hasSlackError} />{" "}
            {hasSlackError && (
              <StatusMessageText>
                {jt`Need help? ${(
                  <ExternalLink href="https://www.metabase.com/docs/latest/administration-guide/09-setting-up-slack.html">
                    {t`See our docs`}
                  </ExternalLink>
                )}.`}
              </StatusMessageText>
            )}
          </StatusMessage>
        </StatusPrimary>
        <StatusSecondary>
          <SlackButton />
        </StatusSecondary>
      </StatusHeader>
      <StatusForm />
      <StatusFooter>
        <Button onClick={handleOpen}>{t`Delete Slack App`}</Button>
      </StatusFooter>
      {isOpened && (
        <Modal isOpen={isOpened} full={false} onClose={handleClose}>
          <SlackDeleteModal onDelete={onDelete} onClose={handleClose} />
        </Modal>
      )}
    </StatusRoot>
  );
};

export default SlackStatus;
