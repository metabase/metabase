import { t } from "ttag";
import _ from "underscore";

import { useListChannelsQuery, useListUserRecipientsQuery } from "metabase/api";
import { useSelector } from "metabase/lib/redux";
import {
  canManageSubscriptions as canManageSubscriptionsSelector,
  getUser,
} from "metabase/selectors/user";
import { Button, Modal, Stack, rem } from "metabase/ui";
import type { AlertNotification } from "metabase-types/api";

import { AlertListItem } from "./AlertListItem";

type AlertListModalProps = {
  questionAlerts?: AlertNotification[];
  opened: boolean;
  onCreate: () => void;
  onEdit: (notification: AlertNotification) => void;
  onDelete: (notification: AlertNotification) => void;
  onUnsubscribe: (notification: AlertNotification) => void;
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

  const isCreatedByCurrentUser = (alert: AlertNotification) => {
    return user ? alert.creator.id === user.id : false;
  };

  const [ownAlerts, othersAlerts] = _.partition(
    questionAlerts,
    isCreatedByCurrentUser,
  );

  // user's own alert should be shown first if it exists
  const sortedQuestionAlerts = [...ownAlerts, ...othersAlerts];

  return (
    <Modal
      data-testid="alert-list-modal"
      opened={opened}
      size={rem(600)}
      onClose={onClose}
      padding="xl"
      title={t`Edit alerts`}
    >
      <Stack gap="lg" mb="lg" mt="1rem">
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
    </Modal>
  );
};
