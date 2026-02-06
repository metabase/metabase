import { useCallback, useState } from "react";
import { t } from "ttag";

import { Button } from "metabase/common/components/Button";
import { ModalContent } from "metabase/common/components/ModalContent";
import { FormMessage } from "metabase/forms";
import type { Response } from "metabase/forms/components/FormMessage";
import type { Alert, DashboardSubscription, User } from "metabase-types/api";

import type { NotificationType } from "../../types";

type UnsubscribeModalProps = {
  item: Alert | DashboardSubscription;
  type: NotificationType;
  user: User;
  onUnsubscribe: (item: Alert | DashboardSubscription) => Promise<void>;
  onArchive: (
    item: Alert | DashboardSubscription,
    type: NotificationType,
    hasUnsubscribed: boolean,
  ) => void;
  onClose: () => void;
};

function UnsubscribeModal({
  item,
  type,
  user,
  onUnsubscribe,
  onArchive,
  onClose,
}: UnsubscribeModalProps): JSX.Element {
  const [error, setError] = useState<Response>();

  const handleUnsubscribeClick = useCallback(async () => {
    try {
      await onUnsubscribe(item);

      if (isCreator(item, user)) {
        onArchive(item, type, true);
      } else {
        onClose();
      }
    } catch (err) {
      setError(err as Response);
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
        {t`Depending on your organization's permissions you might need to ask a moderator to be re-added in the future.`}
      </p>
    </ModalContent>
  );
}

const isCreator = (
  item: Alert | DashboardSubscription,
  user: User,
): boolean => {
  return user.id === item.creator?.id;
};

const getUnsubscribeMessage = (type: NotificationType): string => {
  switch (type) {
    case "alert":
      return t`You'll stop receiving this alert from now on. `;
    case "pulse":
      return t`You'll stop receiving this subscription from now on. `;
  }
};

export { UnsubscribeModal };
