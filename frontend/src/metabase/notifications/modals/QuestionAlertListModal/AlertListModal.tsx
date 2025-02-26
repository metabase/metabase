import { t } from "ttag";
import _ from "underscore";

import { useListChannelsQuery, useListUserRecipientsQuery } from "metabase/api";
import { useSelector } from "metabase/lib/redux";
import {
  canManageSubscriptions as canManageSubscriptionsSelector,
  getUser,
} from "metabase/selectors/user";
import { Button, Modal, Stack, rem } from "metabase/ui";
import type { Notification } from "metabase-types/api";

import { AlertListItem } from "./AlertListItem";

type AlertListModalProps = {
  questionAlerts?: Notification[];
  opened: boolean;
  onCreate: () => void;
  onEdit: (notification: Notification) => void;
  onDelete: (notification: Notification) => void;
  onUnsubscribe: (notification: Notification) => void;
  onClose: () => void;
};

export const AlertListModal = ({
  questionAlerts,
  opened,
  onCreate,
  onEdit,
  onDelete,
  onUnsubscribe,
  onClose,
}: AlertListModalProps) => {
  const user = useSelector(getUser);
  const canManageSubscriptions = useSelector(canManageSubscriptionsSelector);
  const isAdmin = user?.is_superuser;

  const { data: users } = useListUserRecipientsQuery();
  const { data: httpChannelsConfig } = useListChannelsQuery();

  if (!questionAlerts) {
    return null;
  }

  const isCreatedByCurrentUser = (alert: Notification) => {
    return user ? alert.creator.id === user.id : false;
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
        <Modal.Header p="2rem" pb="1.5rem">
          <Modal.Title>{t`Edit alerts`}</Modal.Title>
          <Modal.CloseButton />
        </Modal.Header>
        <Modal.Body p="2rem" pt="0">
          <Stack gap="1.5rem" mb="1.5rem">
            {sortedQuestionAlerts.map(alert => {
              const canEditAlert =
                isAdmin ||
                (canManageSubscriptions && isCreatedByCurrentUser(alert));
              return (
                <AlertListItem
                  key={alert.id}
                  alert={alert}
                  users={users?.data}
                  httpChannelsConfig={httpChannelsConfig}
                  canEdit={canEditAlert}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onUnsubscribe={onUnsubscribe}
                />
              );
            })}
          </Stack>
          <div>
            <Button variant="filled" onClick={onCreate}>{t`New alert`}</Button>
          </div>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
};
