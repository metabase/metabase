import cx from "classnames";
import { type MouseEvent, useState } from "react";
import { msgid, ngettext, t } from "ttag";
import _ from "underscore";

import { formatCreatorMessage } from "metabase/account/notifications/components/NotificationCard/utils";
import { getNotificationHandlersGroupedByTypes } from "metabase/lib/notifications";
import { useSelector } from "metabase/lib/redux";
import { isNotFalsy } from "metabase/lib/types";
import { NotificationActionButton } from "metabase/notifications/modals/components";
import { getUser } from "metabase/selectors/user";
import { Box, FixedSizeIcon, Group, Stack, Text } from "metabase/ui";
import type {
  NotificationChannel,
  NotificationHandlerEmail,
  NotificationHandlerHttp,
  NotificationHandlerSlack,
  SystemEvent,
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
  const subscription = notification.subscriptions[0];

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
        {formatTitle(subscription?.event_name)}
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

      <Stack className={S.handlersContainer} gap="0.5rem" mt="1rem">
        {emailHandler && (
          <Group gap="sm" wrap="nowrap">
            <FixedSizeIcon name="mail" size={16} c="text-secondary" />
            <Text size="sm" lineClamp={1} c="inherit">
              {formatEmailHandlerInfo(emailHandler, users)}
            </Text>
          </Group>
        )}
        {slackHandler && (
          <Group gap="sm" wrap="nowrap">
            <FixedSizeIcon name="slack" size={16} c="text-secondary" />
            <Text size="sm" lineClamp={1} c="inherit">
              {formatSlackHandlerInfo(slackHandler)}
            </Text>
          </Group>
        )}
        {hookHandlers && (
          <Group gap="sm" wrap="nowrap">
            <FixedSizeIcon name="webhook" size={16} c="text-secondary" />
            <Text size="sm" lineClamp={1} c="inherit">
              {formatHttpHandlersInfo(hookHandlers, httpChannelsConfig)}
            </Text>
          </Group>
        )}
      </Stack>
      {showHoverActions && (
        <div className={S.actionButtonContainer}>
          {canEdit ? (
            <NotificationActionButton
              label={t`Delete this notification`}
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

const formatTitle = (sendCondition: SystemEvent): string => {
  switch (sendCondition) {
    case "event/data-editing-row-create":
      return t`Notify when new record is created`;
    case "event/data-editing-row-update":
      return t`Notify when record is updated`;
    case "event/data-editing-row-delete":
      return t`Notify when record is deleted`;
  }
};

const formatEmailHandlerInfo = (
  emailHandler: NotificationHandlerEmail,
  users: User[] | undefined,
) => {
  if (!users) {
    return null;
  }

  const usersMap = _.indexBy(users, "id");

  const emailRecipients = emailHandler.recipients
    .map(recipient => {
      if (recipient.type === "notification-recipient/raw-value") {
        return recipient.details.value;
      }
      if (recipient.type === "notification-recipient/user") {
        return usersMap[recipient.user_id]?.email;
      }
    })
    .filter(isNotFalsy);

  const maxEmailsToDisplay = 2;

  if (emailRecipients.length > maxEmailsToDisplay) {
    const restItemsLength = emailRecipients.length - maxEmailsToDisplay;
    return [
      emailRecipients.slice(0, maxEmailsToDisplay).join(", "),
      ngettext(
        msgid`${restItemsLength} other`,
        `${restItemsLength} others`,
        restItemsLength,
      ),
    ].join(", ");
  }

  return emailRecipients.join(", ");
};

const formatSlackHandlerInfo = (handler: NotificationHandlerSlack) => {
  return handler.recipients[0]?.details.value;
};

const formatHttpHandlersInfo = (
  handlers: NotificationHandlerHttp[],
  httpChannelsConfig: NotificationChannel[] | undefined,
) => {
  return handlers
    .map(
      ({ channel_id }) =>
        httpChannelsConfig?.find(({ id }) => channel_id === id)?.name ||
        t`unknown`,
    )
    .join(", ");
};
