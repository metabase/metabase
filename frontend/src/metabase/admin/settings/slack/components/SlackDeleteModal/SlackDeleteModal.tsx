import { useCallback } from "react";
import { t } from "ttag";

import ActionButton from "metabase/components/ActionButton";
import ModalContent from "metabase/components/ModalContent";
import Button from "metabase/core/components/Button";

export interface SlackDeleteModalProps {
  onDelete: () => void;
  onClose: () => void;
}

const SlackDeleteModal = ({
  onDelete,
  onClose,
}: SlackDeleteModalProps): JSX.Element => {
  const handleDelete = useCallback(async () => {
    await onDelete();
    onClose();
  }, [onDelete, onClose]);

  return (
    <ModalContent
      title={t`Are you sure you want to delete your Slack App?`}
      footer={[
        <Button key="close" onClick={onClose}>
          {t`Cancel`}
        </Button>,
        <ActionButton
          key="delete"
          danger
          normalText={t`Delete`}
          activeText={t`Deleting…`}
          failedText={t`Deleting failed`}
          successText={t`Deleted`}
          actionFn={handleDelete}
        />,
      ]}
    >
      <span>
        {t`Doing this may stop your dashboard subscriptions from appearing in Slack until a new connection is set up.`}{" "}
        {t`Are you sure you want to delete your Slack App integration?`}
      </span>
    </ModalContent>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default SlackDeleteModal;
