import React, { useCallback, useState } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import Button from "metabase/components/Button";
import ModalContent from "metabase/components/ModalContent";
import FormMessage from "metabase/components/form/FormMessage";
import { ModalMessage } from "./UnsubscribeUserForm.styled";

const propTypes = {
  user: PropTypes.object.isRequired,
  onUnsubscribe: PropTypes.func,
  onClose: PropTypes.func,
};

const UnsubscribeUserForm = ({ user, onUnsubscribe, onClose }) => {
  const [error, setError] = useState();

  const handleConfirmClick = useCallback(async () => {
    try {
      await onUnsubscribe(user);
      onClose();
    } catch (error) {
      setError(error);
    }
  }, [user, onUnsubscribe, onClose]);

  return (
    <ModalContent
      title={t`Unsubscribe from all subscriptions / alerts`}
      footer={[
        error ? <FormMessage key="message" formError={error} /> : null,
        <Button key="cancel" onClick={onClose}>{t`Cancel`}</Button>,
        <Button
          key="submit"
          danger
          onClick={handleConfirmClick}
        >{t`Confirm`}</Button>,
      ]}
      onClose={onClose}
    >
      <ModalMessage>
        {t`This will delete any dashboard subscriptions or alerts that ${user.common_name} has created and remove them as a recipient from other people’s subscriptions or alerts.`}
      </ModalMessage>
      <ModalMessage>
        {t`This does not effect email distribution lists that are managed outside of Metabase.`}
      </ModalMessage>
    </ModalContent>
  );
};

UnsubscribeUserForm.propTypes = propTypes;

export default UnsubscribeUserForm;
