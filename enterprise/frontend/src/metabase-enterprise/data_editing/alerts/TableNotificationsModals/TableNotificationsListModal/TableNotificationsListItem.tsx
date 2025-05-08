import cx from "classnames";
import { type MouseEvent, useState } from "react";
import { t } from "ttag";

import { formatCreatorMessage } from "metabase/account/notifications/components/NotificationCard/utils";
import { getNotificationHandlersGroupedByTypes } from "metabase/lib/notifications";
import { useSelector } from "metabase/lib/redux";
import {
  HandlersInfo,
  NotificationActionButton,
} from "metabase/notifications/modals/shared/components";
import { getUser } from "metabase/selectors/user";
import { Box, Group, Text } from "metabase/ui";
import type {
  NotificationChannel,
  NotificationTriggerEvent,
  TableNotification,
  User,
} from "metabase-types/api";

import S from "./TableNotificationsListItem.module.css";

type TableNotificationsListItemProps = {
  notification: TableNotification;
  canEdit: boolean;
  users: User[] | undefined;
  httpChannelsConfig: NotificationChannel[] | undefined;
  onEdit: (notification: TableNotification) => void;
  onUnsubscribe: (notification: TableNotification) => void;
  onDelete: (notification: TableNotification) => void;
};

export const TableNotificationsListItem = ({
  notification,
  canEdit,
  users,
  httpChannelsConfig,
  onEdit,
  onUnsubscribe,
  onDelete,
}: TableNotificationsListItemProps) => {
  const user = useSelector(getUser);

  const [showHoverActions, setShowHoverActions] = useState(false);

  const { emailHandler, slackHandler, hookHandlers } =
    getNotificationHandlersGroupedByTypes(notification.handlers);

  const handleEdit = () => {
    if (canEdit) {
      onEdit(notification);
    }
  };

  const handleUnsubscribe = (e: MouseEvent) => {
    e.stopPropagation();

    onUnsubscribe(notification);
  };

  const handleDelete = (e: MouseEvent) => {
    e.stopPropagation();

    onDelete(notification);
  };

  const handleMouseEnter = () => {
    setShowHoverActions(true);
  };

  const handleMouseLeave = () => {
    setShowHoverActions(false);
  };

  return (
    <Box
      className={cx(
        S.notificationListItem,
        canEdit && S.notificationListItemEditable,
      )}
      p="1rem"
      onClick={handleEdit}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <Text className={S.itemTitle} size="md" lineClamp={1} fw="bold">
        {formatTitle(notification.payload.event_name)}
      </Text>
      <Group gap="xs" align="center" c="text-secondary">
        {user && (
          <>
            <Text size="sm" c="text-light">
              •
            </Text>
            <Text size="sm" c="inherit">
              {formatCreatorMessage(notification, user?.id)}
            </Text>
          </>
        )}
      </Group>

      <HandlersInfo
        emailHandler={emailHandler}
        slackHandler={slackHandler}
        hookHandlers={hookHandlers}
        users={users}
        httpChannelsConfig={httpChannelsConfig}
        mt="1rem"
      />

      {showHoverActions && (
        <div className={S.actionButtonContainer}>
          {canEdit ? (
            <NotificationActionButton
              label={t`Delete this alert`}
              iconName="trash"
              onClick={handleDelete}
            />
          ) : (
            <NotificationActionButton
              label={t`Unsubscribe from this`}
              iconName="unsubscribe"
              onClick={handleUnsubscribe}
            />
          )}
        </div>
      )}
    </Box>
  );
};

const formatTitle = (eventName: NotificationTriggerEvent): string => {
  switch (eventName) {
    case "event/row.created":
      return t`Notify when new records are created`;
    case "event/row.updated":
      return t`Notify when records are updated`;
    case "event/row.deleted":
      return t`Notify when records are deleted`;
    default:
      return t`Notification`;
  }
};
