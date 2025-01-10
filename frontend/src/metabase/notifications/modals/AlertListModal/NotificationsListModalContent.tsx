import { t } from "ttag";
import _ from "underscore";

import ModalContent from "metabase/components/ModalContent";
import { useSelector } from "metabase/lib/redux";
import { getUser } from "metabase/selectors/user";
import { Button } from "metabase/ui";
import type { Notification } from "metabase-types/api";

import { AlertListItem } from "./AlertListItem";

type NotificationsListModalContentProps = {
  questionAlerts?: Notification[];
  onCreate: () => void;
  onEdit: (notification: Notification) => void;
  onClose: () => void;
};

export const NotificationsListModalContent = ({
  questionAlerts,
  onCreate,
  onEdit,
  onClose,
}: NotificationsListModalContentProps) => {
  const user = useSelector(getUser);
  const isAdmin = user?.is_superuser;

  if (!questionAlerts) {
    return null;
  }

  const isCreatedByCurrentUser = (alert: Notification) => {
    return user ? alert.creator.id === user.id : false;
  };

  const onUnsubscribe = () => {
    const alertCount = Object.keys(questionAlerts).length;

    // if we have just unsubscribed from the last alert, close the popover
    if (alertCount <= 1) {
      onClose();
    }
  };

  const [ownAlerts, othersAlerts] = _.partition(
    questionAlerts,
    isCreatedByCurrentUser,
  );

  // user's own alert should be shown first if it exists
  const sortedQuestionAlerts = [...ownAlerts, ...othersAlerts];

  return (
    <ModalContent
      data-testid="alert-list-modal"
      title={t`Edit alerts`}
      footer={
        <Button variant="filled" onClick={onCreate}>{t`New alert`}</Button>
      }
      onClose={onClose}
    >
      {sortedQuestionAlerts.map(alert => (
        <AlertListItem
          key={alert.id}
          alert={alert}
          canEdit={isAdmin || isCreatedByCurrentUser(alert)}
          onEdit={() => onEdit(alert)}
          onUnsubscribe={onUnsubscribe}
        />
      ))}
    </ModalContent>
  );
};
