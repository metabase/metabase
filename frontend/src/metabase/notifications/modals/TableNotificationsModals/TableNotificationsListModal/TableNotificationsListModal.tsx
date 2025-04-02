import { t } from "ttag";
import _ from "underscore";

import { useListChannelsQuery, useListUserRecipientsQuery } from "metabase/api";
import { useSelector } from "metabase/lib/redux";
import {
  canManageSubscriptions as canManageSubscriptionsSelector,
  getUser,
} from "metabase/selectors/user";
import { Button, Modal, type ModalProps, Stack, rem } from "metabase/ui";
import type { TableNotification } from "metabase-types/api";

import { TableNotificationsListItem } from "./TableNotificationsListItem";

type TableNotificationsListModal = {
  notifications?: TableNotification[];
  opened: boolean;
  onCreate: () => void;
  onEdit: (notification: TableNotification) => void;
  onDelete: (notification: TableNotification) => void;
  onUnsubscribe: (notification: TableNotification) => void;
  onClose: () => void;
};

export const TableNotificationsListModal = ({
  notifications,
  opened,
  onCreate,
  onEdit,
  onDelete,
  onUnsubscribe,
  onClose,
  ...modalProps
}: TableNotificationsListModal & ModalProps) => {
  const user = useSelector(getUser);
  const canManageSubscriptions = useSelector(canManageSubscriptionsSelector);
  const isAdmin = user?.is_superuser;

  const { data: users } = useListUserRecipientsQuery();
  const { data: httpChannelsConfig } = useListChannelsQuery();

  if (!notifications) {
    return null;
  }

  const isCreatedByCurrentUser = (notification: TableNotification) => {
    return user ? notification.creator.id === user.id : false;
  };

  const [ownNotifications, othersNotifications] = _.partition(
    notifications,
    isCreatedByCurrentUser,
  );

  // user's own alert should be shown first if it exists
  const sortedNotifications = [...ownNotifications, ...othersNotifications];

  return (
    <Modal
      data-testid="alert-list-modal"
      opened={opened}
      size={rem(600)}
      onClose={onClose}
      padding="xl"
      title={t`Edit alerts`}
      {...modalProps}
    >
      <Stack gap="lg" mb="lg" mt="1rem">
        {sortedNotifications.map((notification) => {
          const canEditNotification =
            isAdmin ||
            (canManageSubscriptions && isCreatedByCurrentUser(notification));
          return (
            <TableNotificationsListItem
              key={notification.id}
              notification={notification}
              users={users?.data}
              httpChannelsConfig={httpChannelsConfig}
              canEdit={canEditNotification}
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
    </Modal>
  );
};
