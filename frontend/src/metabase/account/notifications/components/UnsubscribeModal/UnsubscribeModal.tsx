import { type JSX, useCallback, useState } from "react";
import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { FormMessage } from "metabase/forms";
import type { NotificationType } from "metabase/notifications/types";
import { Box, Button, Modal, Text } from "metabase/ui";
import type { Alert, DashboardSubscription, User } from "metabase-types/api";

type UnsubscribeModalProps = {
  item: Alert | DashboardSubscription | undefined;
  loading?: boolean;
  error?: unknown;
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
  loading = false,
  error,
  onClose,
  ...props
}: UnsubscribeModalProps): JSX.Element {
  return (
    <Modal
      opened
      size="lg"
      title={t`Confirm you want to unsubscribe`}
      onClose={onClose}
    >
      {loading || error || !item ? (
        <LoadingAndErrorWrapper loading={loading} error={error} />
      ) : (
        <UnsubscribeModalBody {...props} item={item} onClose={onClose} />
      )}
    </Modal>
  );
}

type UnsubscribeModalBodyProps = Omit<
  UnsubscribeModalProps,
  "item" | "loading" | "error"
> & {
  item: Alert | DashboardSubscription;
};

function UnsubscribeModalBody({
  item,
  type,
  user,
  onUnsubscribe,
  onArchive,
  onClose,
}: UnsubscribeModalBodyProps): JSX.Element {
  const [error, setError] = useState<unknown>();

  const handleUnsubscribeClick = useCallback(async () => {
    try {
      await onUnsubscribe(item);

      if (isCreator(item, user)) {
        onArchive(item, type, true);
      } else {
        onClose();
      }
    } catch (err) {
      setError(err);
    }
  }, [item, type, user, onUnsubscribe, onArchive, onClose]);

  return (
    <>
      <Text>
        {getUnsubscribeMessage(type)}
        {t`Depending on your organization's permissions you might need to ask a moderator to be re-added in the future.`}
      </Text>
      <Modal.Footer>
        {error ? (
          <Box flex={1}>
            <FormMessage formError={error} noPadding />
          </Box>
        ) : null}
        <Button onClick={onClose}>{t`I changed my mind`}</Button>
        <Button
          variant="filled"
          color="negative"
          onClick={handleUnsubscribeClick}
        >
          {t`Unsubscribe`}
        </Button>
      </Modal.Footer>
    </>
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
