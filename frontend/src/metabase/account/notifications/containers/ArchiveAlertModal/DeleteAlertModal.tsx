import type { Location } from "history";
import { t } from "ttag";

import {
  skipToken,
  useGetNotificationQuery,
  useUpdateNotificationMutation,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useToast } from "metabase/common/hooks/use-toast";
import { DeleteAlertConfirmModal } from "metabase/notifications/modals/DeleteAlertConfirmModal";
import type { Notification } from "metabase-types/api";

import { getAlertId } from "../../selectors";

type DeleteAlertModalProps = {
  params: {
    alertId?: string;
  };
  location: Location<{ unsubscribed?: boolean }>;
  onClose: () => void;
};

export const DeleteAlertModal = ({
  params,
  location,
  onClose,
}: DeleteAlertModalProps) => {
  const id = getAlertId(params?.alertId);

  const [sendToast] = useToast();

  const hasUnsubscribed = location.query?.unsubscribed;

  const {
    data: notification,
    isLoading,
    error,
  } = useGetNotificationQuery(id || skipToken);
  const [updateNotification] = useUpdateNotificationMutation();

  const handleDelete = async (itemToDelete: Notification) => {
    const result = await updateNotification({
      ...itemToDelete,
      active: false,
    });

    if (result.error) {
      sendToast({
        icon: "warning",
        toastColor: "error",
        message: t`An error occurred`,
      });
      return;
    }

    sendToast({ message: t`The alert was successfully deleted.` });
    onClose();
  };

  return (
    <LoadingAndErrorWrapper loading={isLoading} error={error}>
      {() =>
        notification ? (
          <DeleteAlertConfirmModal
            title={
              hasUnsubscribed
                ? t`You’re unsubscribed. Delete this alert as well?`
                : undefined
            }
            onConfirm={() => handleDelete(notification)}
            onClose={onClose}
          />
        ) : (
          <div>{t`Not found`}</div>
        )
      }
    </LoadingAndErrorWrapper>
  );
};
