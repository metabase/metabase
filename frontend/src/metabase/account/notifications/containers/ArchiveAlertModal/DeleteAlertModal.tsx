import type { Location } from "history";
import { t } from "ttag";

import {
  skipToken,
  useGetNotificationQuery,
  useUpdateNotificationMutation,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";
import { useDispatch } from "metabase/lib/redux";
import { DeleteAlertConfirmModal } from "metabase/notifications/modals/DeleteAlertConfirmModal";
import { addUndo } from "metabase/redux/undo";
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

  const dispatch = useDispatch();

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
      dispatch(
        addUndo({
          icon: "warning",
          toastColor: "error",
          message: t`An error occurred`,
        }),
      );
      return;
    }

    dispatch(addUndo({ message: t`The alert was successfully deleted.` }));
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
