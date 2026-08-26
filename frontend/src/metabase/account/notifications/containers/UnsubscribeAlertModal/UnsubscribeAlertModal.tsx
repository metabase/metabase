import { t } from "ttag";

import { getArchiveUrl } from "metabase/account/notifications/actions";
import {
  skipToken,
  useGetNotificationQuery,
  useUnsubscribeFromNotificationMutation,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useToast } from "metabase/common/hooks/use-toast";
import { getUser } from "metabase/current-user";
import { UnsubscribeConfirmModal } from "metabase/notifications/modals/UnsubscribeConfirmModal";
import { useSelector } from "metabase/redux";
import { useNavigate } from "metabase/router";
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

  const navigate = useNavigate();
  const [sendToast] = useToast();

  const {
    data: notification,
    isLoading,
    error,
  } = useGetNotificationQuery(id || skipToken);
  const [unsubscribe] = useUnsubscribeFromNotificationMutation();

  const handleUnsubscribe = async (alert: Notification) => {
    const result = await unsubscribe(alert.id);

    if (result.error) {
      sendToast({
        icon: "warning",
        toastColor: "feedback-negative",
        message: t`An error occurred`,
      });
      return;
    }

    sendToast({ message: t`Successfully unsubscribed.` });

    if (isCreator(alert, user)) {
      onClose();
      navigate(getArchiveUrl(alert, "question-notification", true));
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
