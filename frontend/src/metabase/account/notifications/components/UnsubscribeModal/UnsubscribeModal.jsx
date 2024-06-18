import PropTypes from "prop-types";
import { useCallback, useState } from "react";
import { t } from "ttag";

import ModalContent from "metabase/components/ModalContent";
import Button from "metabase/core/components/Button";
import { FormMessage } from "metabase/forms";

const propTypes = {
  item: PropTypes.object.isRequired,
  type: PropTypes.oneOf(["alert", "pulse"]).isRequired,
  user: PropTypes.object,
  onUnsubscribe: PropTypes.func,
  onArchive: PropTypes.func,
  onClose: PropTypes.func,
};

const UnsubscribeModal = ({
  item,
  type,
  user,
  onUnsubscribe,
  onArchive,
  onClose,
}) => {
  const [error, setError] = useState();

  const handleUnsubscribeClick = useCallback(async () => {
    try {
      await onUnsubscribe(item);

      if (isCreator(item, user)) {
        onArchive(item, type, true);
      } else {
        onClose();
      }
    } catch (error) {
      setError(error);
    }
  }, [item, type, user, onUnsubscribe, onArchive, onClose]);

  return (
    <ModalContent
      title={t`Confirm you want to unsubscribe`}
      footer={[
        error ? <FormMessage key="message" formError={error} /> : null,
        <Button key="cancel" onClick={onClose}>
          {t`I changed my mind`}
        </Button>,
        <Button key="submit" warning onClick={handleUnsubscribeClick}>
          {t`Unsubscribe`}
        </Button>,
      ]}
      onClose={onClose}
    >
      <p>
        {getUnsubscribeMessage(type)}
        {t`Depending on your organization’s permissions you might need to ask a moderator to be re-added in the future.`}
      </p>
    </ModalContent>
  );
};

UnsubscribeModal.propTypes = propTypes;

const isCreator = (item, user) => {
  return user != null && user.id === item.creator?.id;
};

const getUnsubscribeMessage = type => {
  switch (type) {
    case "alert":
      return t`You’ll stop receiving this alert from now on. `;
    case "pulse":
      return t`You’ll stop receiving this subscription from now on. `;
  }
};

export default UnsubscribeModal;
