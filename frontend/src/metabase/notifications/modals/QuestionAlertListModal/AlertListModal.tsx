import { t } from "ttag";
import _ from "underscore";

import { useSelector } from "metabase/lib/redux";
import { getUser } from "metabase/selectors/user";
import { Button, Modal, Stack, rem } from "metabase/ui";
import type { Notification } from "metabase-types/api";

import { AlertListItem } from "./AlertListItem";

type AlertListModalProps = {
  questionAlerts?: Notification[];
  opened: boolean;
  onCreate: () => void;
  onEdit: (notification: Notification) => void;
  onDelete: (notification: Notification) => void;
  onClose: () => void;
};

export const AlertListModal = ({
  questionAlerts,
  opened,
  onCreate,
  onEdit,
  onDelete,
  onClose,
}: AlertListModalProps) => {
  const user = useSelector(getUser);
  const isAdmin = user?.is_superuser;

  // close list if there are no alerts (e.g. after delete)
  // useEffect(() => {
  //   if (questionAlerts?.length || 0 <= 0) {
  //     onClose();
  //   }
  // }, [onClose, questionAlerts?.length]);

  if (!questionAlerts) {
    return null;
  }

  const isCreatedByCurrentUser = (alert: Notification) => {
    return user ? alert.creator.id === user.id : false;
  };

  const onUnsubscribe = () => {
    const alertCount = questionAlerts.length;

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
    <Modal.Root
      data-testid="alert-list-modal"
      opened={opened}
      size={rem(600)}
      onClose={onClose}
    >
      <Modal.Overlay />
      <Modal.Content>
        <Modal.Header p="2.5rem" pb="2rem">
          <Modal.Title>{t`Edit alerts`}</Modal.Title>
          <Modal.CloseButton />
        </Modal.Header>
        <Modal.Body p="2.5rem">
          <Stack spacing="1rem" mb="2rem">
            {sortedQuestionAlerts.map(alert => (
              <AlertListItem
                key={alert.id}
                alert={alert}
                canEdit={isAdmin || isCreatedByCurrentUser(alert)}
                onEdit={() => onEdit(alert)}
                onDelete={() => onDelete(alert)}
                onUnsubscribe={onUnsubscribe}
              />
            ))}
          </Stack>
          <div>
            <Button variant="filled" onClick={onCreate}>{t`New alert`}</Button>
          </div>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
};
