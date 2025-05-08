import { useCallback, useState } from "react";
import { t } from "ttag";

import { ConfirmModal } from "metabase/components/ConfirmModal";
import { getResponseErrorMessage } from "metabase/lib/errors";
import type { User } from "metabase-types/api";

import { ModalMessage } from "./UnsubscribeUserForm.styled";

interface UnsubscribeUserFormProps {
  user: User;
  onUnsubscribe: (user: User) => void | Promise<void>;
  onClose: () => void;
}

export const UnsubscribeUserForm = ({
  user,
  onUnsubscribe,
  onClose,
}: UnsubscribeUserFormProps) => {
  const [errorMessage, setErrorMessage] = useState<string>();

  const handleConfirmClick = useCallback(async () => {
    try {
      await onUnsubscribe(user);
      onClose();
    } catch (error) {
      const msg = getResponseErrorMessage(error);
      setErrorMessage(msg ?? t`Unknown error encountered`);
    }
  }, [user, onUnsubscribe, onClose]);

  return (
    <ConfirmModal
      opened
      errorMessage={errorMessage}
      onClose={onClose}
      onConfirm={handleConfirmClick}
      title={t`Unsubscribe ${user.common_name} from all subscriptions and alerts?`}
      confirmButtonText={t`Unsubscribe`}
      message={
        <>
          <ModalMessage>
            {t`This will delete any dashboard subscriptions or alerts ${user.common_name} has created, and remove them as a recipient from any other subscriptions or alerts.`}
          </ModalMessage>
          <ModalMessage>
            {/* eslint-disable-next-line no-literal-metabase-strings -- Metabase settings */}
            {t`This does not affect email distribution lists that are managed outside of Metabase.`}
          </ModalMessage>
        </>
      }
    />
  );
};
