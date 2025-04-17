import { t } from "ttag";

import { navigateToArchive } from "metabase/account/notifications/actions";
import {
  skipToken,
  useGetNotificationQuery,
  useUnsubscribeFromNotificationMutation,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { UnsubscribeConfirmModal } from "metabase/notifications/modals/UnsubscribeConfirmModal";
import { addUndo } from "metabase/redux/undo";
import { getUser } from "metabase/selectors/user";
import type { Notification, User } from "metabase-types/api";

import { getAlertId } from "../../selectors";

type UnsubscribeAlertModalProps = {
  params: {
    alertId?: string;
  };
  onClose: () => void;
};

export const UnsubscribeAlertModal = ({
  params,
  onClose,
}: UnsubscribeAlertModalProps) => {
  const id = getAlertId(params?.alertId);
  const user = useSelector(getUser);

  const dispatch = useDispatch();

  const {
    data: notification,
    isLoading,
    error,
  } = useGetNotificationQuery(id || skipToken);
  const [unsubscribe] = useUnsubscribeFromNotificationMutation();

  const handleUnsubscribe = async (alert: Notification) => {
    const result = await unsubscribe(alert.id);

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

    dispatch(addUndo({ message: t`Successfully unsubscribed.` }));

    if (isCreator(alert, user)) {
      onClose();
      dispatch(navigateToArchive(alert, "question-notification", true));
    } else {
      onClose();
    }
  };

  return (
    <LoadingAndErrorWrapper loading={isLoading} error={error}>
      {() =>
        notification ? (
          <UnsubscribeConfirmModal
            onConfirm={() => handleUnsubscribe(notification)}
            onClose={onClose}
          />
        ) : (
          <div>{t`Not found`}</div>
        )
      }
    </LoadingAndErrorWrapper>
  );
};

const isCreator = (item: Notification, user: User | null) => {
  return user != null && user.id === item.creator?.id;
};
