import { useCallback, useState } from "react";
import { t } from "ttag";

import { Button } from "metabase/common/components/Button";
import { ModalContent } from "metabase/common/components/ModalContent";
import { FormMessage } from "metabase/forms";
import type { Alert, User } from "metabase-types/api";

interface UnsubscribeModalProps {
  item: Alert;
  type: "alert" | "pulse";
  user?: User | null;
  onUnsubscribe?: (item: Alert) => Promise<void>;
  onArchive?: (item: Alert, type: "alert" | "pulse", hasUnsubscribed: boolean) => void;
  onClose?: () => void;
}

const UnsubscribeModal = ({
  item,
  type,
  user,
  onUnsubscribe,
  onArchive,
  onClose,
}: UnsubscribeModalProps) => {
  const [error, setError] = useState<{ status: number; data?: { message?: string } }>();

  const handleUnsubscribeClick = useCallback(async () => {
    try {
      await onUnsubscribe?.(item);

      if (isCreator(item, user)) {
        onArchive?.(item, type, true);
      } else {
        onClose?.();
      }
    } catch (error) {
      setError({ status: 500, data: { message: String(error) } });
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

const isCreator = (item: Alert, user?: User | null) => {
  return user != null && user.id === item.creator?.id;
};

const getUnsubscribeMessage = (type: "alert" | "pulse") => {
  switch (type) {
    case "alert":
      return t`You’ll stop receiving this alert from now on. `;
    case "pulse":
      return t`You’ll stop receiving this subscription from now on. `;
  }
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default UnsubscribeModal;
