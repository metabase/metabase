import React from "react";
import { t } from "ttag";
import Button from "metabase/components/Button";
import ModalContent from "metabase/components/ModalContent";

export interface SlackDeleteModalProps {
  onDelete?: () => void;
  onClose?: () => void;
}

const SlackDeleteModal = ({
  onDelete,
  onClose,
}: SlackDeleteModalProps): JSX.Element => {
  return (
    <ModalContent
      title={t`Are you sure you want to delete your Slack App?`}
      footer={[
        <Button key="close" onClick={onClose}>
          {t`Cancel`}
        </Button>,
      ]}
    >
      <span>
        {t`Doing this may stop your dashboard subscriptions from appearing in Slack until a new connection is set up.`}{" "}
        {t`Are you sure you want to delete your Slack App integration?`}
      </span>
    </ModalContent>
  );
};

export default SlackDeleteModal;
