import { type JSX, useCallback } from "react";
import { t } from "ttag";

import {
  NotificationCardRoot,
  NotificationContent,
  NotificationDescription,
  NotificationIcon,
  NotificationMessage,
} from "metabase/account/notifications/components/NotificationCard/DashboardNotificationCard.styled";
import { formatCreatorMessage } from "metabase/account/notifications/components/NotificationCard/utils";
import type {
  QuestionNotificationListItem,
  TableNotificationListItem,
} from "metabase/account/notifications/types";
import Link from "metabase/core/components/Link/Link";
import {
  canArchive,
  formatNotificationSchedule,
  formatTitle,
  getNotificationEnabledChannelsMap,
} from "metabase/lib/notifications";
import { Group, Icon } from "metabase/ui";
import type { User } from "metabase-types/api";

type NotificationCardProps<
  T extends QuestionNotificationListItem | TableNotificationListItem,
> = {
  listItem: T;
  user: User;
  onUnsubscribe: (listItem: T) => void;
  onArchive: (listItem: T) => void;
  isEditable: boolean;
  entityLink: string;
};

export const NotificationCard = <
  T extends QuestionNotificationListItem | TableNotificationListItem,
>({
  listItem,
  user,
  isEditable,
  onUnsubscribe,
  onArchive,
  entityLink,
}: NotificationCardProps<T>): JSX.Element => {
  const { item } = listItem;
  const hasArchive = canArchive(item, user);

  const enabledChannelsMap = getNotificationEnabledChannelsMap(item);

  const subscription = item.subscriptions[0];

  const onUnsubscribeClick = useCallback(() => {
    onUnsubscribe(listItem);
  }, [listItem, onUnsubscribe]);

  const onArchiveClick = useCallback(() => {
    onArchive(listItem);
  }, [listItem, onArchive]);

  return (
    <NotificationCardRoot data-testid="notification-alert-item">
      <NotificationContent>
        <Link variant="brandBold" to={entityLink}>
          {formatTitle(listItem)}
        </Link>
        <NotificationDescription>
          <NotificationMessage>
            <Group gap="0.75rem" align="center" c="text-medium">
              {enabledChannelsMap["channel/email"] && <Icon name="mail" />}
              {enabledChannelsMap["channel/slack"] && (
                <Icon name="slack" size={14} />
              )}
              {enabledChannelsMap["channel/http"] && (
                <Icon name="webhook" size={16} />
              )}
              <Group gap="0.25rem" align="center" c="text-medium">
                {subscription &&
                  subscription.type === "notification-subscription/cron" && (
                    <span>{formatNotificationSchedule(subscription)}</span>
                  )}
                {" · "}
                {<span>{formatCreatorMessage(item, user.id)}</span>}
              </Group>
            </Group>
          </NotificationMessage>
        </NotificationDescription>
      </NotificationContent>

      {isEditable && !hasArchive && (
        <NotificationIcon
          name="close"
          tooltip={t`Unsubscribe`}
          onClick={onUnsubscribeClick}
        />
      )}
      {isEditable && hasArchive && (
        <NotificationIcon
          name="close"
          tooltip={t`Delete`}
          onClick={onArchiveClick}
        />
      )}
    </NotificationCardRoot>
  );
};
