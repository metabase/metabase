import cx from "classnames";
import { type MouseEvent, useState } from "react";
import { msgid, ngettext, t } from "ttag";
import _ from "underscore";

import { formatCreatorMessage } from "metabase/account/notifications/components/NotificationCard/utils";
import {
  formatNotificationSchedule,
  getNotificationHandlersGroupedByTypes,
} from "metabase/lib/notifications";
import { useSelector } from "metabase/lib/redux";
import { isNotFalsy } from "metabase/lib/types";
import { getUser } from "metabase/selectors/user";
import { Box, FixedSizeIcon, Group, Stack, Text } from "metabase/ui";
import type {
  Notification,
  NotificationCardSendCondition,
  NotificationChannel,
  NotificationHandlerEmail,
  NotificationHandlerHttp,
  NotificationHandlerSlack,
  User,
} from "metabase-types/api";

import S from "./AlertListItem.module.css";
import { AlertListItemActionButton } from "./AlertListItemActionButton";

type AlertListItemProps = {
  alert: Notification;
  canEdit: boolean;
  users: User[] | undefined;
  httpChannelsConfig: NotificationChannel[] | undefined;
  onEdit: (alert: Notification) => void;
  onUnsubscribe: (alert: Notification) => void;
  onDelete: (alert: Notification) => void;
};

export const AlertListItem = ({
  alert,
  canEdit,
  users,
  httpChannelsConfig,
  onEdit,
  onUnsubscribe,
  onDelete,
}: AlertListItemProps) => {
  const user = useSelector(getUser);

  const [showHoverActions, setShowHoverActions] = useState(false);

  const { emailHandler, slackHandler, hookHandlers } =
    getNotificationHandlersGroupedByTypes(alert.handlers);
  const subscription = alert.subscriptions[0];

  const handleEdit = () => {
    if (canEdit) {
      onEdit(alert);
    }
  };

  const handleUnsubscribe = (e: MouseEvent) => {
    e.stopPropagation();

    onUnsubscribe(alert);
  };

  const handleDelete = (e: MouseEvent) => {
    e.stopPropagation();

    onDelete(alert);
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
        {formatTitle(alert.payload.send_condition)}
      </Text>
      <Group gap="xs" align="center" c="text-secondary">
        {subscription && (
          <Text size="sm" c="inherit">
            {formatNotificationSchedule(subscription)}
          </Text>
        )}
        {user && (
          <>
            <Text size="sm" c="text-tertiary">
              •
            </Text>
            <Text size="sm" c="inherit">
              {formatCreatorMessage(alert, user?.id)}
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
            <AlertListItemActionButton
              label={t`Delete this alert`}
              iconName="trash"
              onClick={handleDelete}
            />
          ) : (
            <AlertListItemActionButton
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

const formatTitle = (sendCondition: NotificationCardSendCondition): string => {
  switch (sendCondition) {
    case "has_result":
      return t`Alert when this has results`;
    case "goal_above":
      return t`Alert when this reaches a goal`;
    case "goal_below":
      return t`Alert when this goes below a goal`;
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
    .map((recipient) => {
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
