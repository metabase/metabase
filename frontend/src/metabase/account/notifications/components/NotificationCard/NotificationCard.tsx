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
import type { QuestionNotificationListItem } from "metabase/account/notifications/types";
import Link from "metabase/common/components/Link/Link";
import {
  canArchive,
  formatNotificationSchedule,
  formatTitle,
  getNotificationEnabledChannelsMap,
} from "metabase/lib/notifications";
import * as Urls from "metabase/lib/urls";
import { Group, Icon } from "metabase/ui";
import type { User } from "metabase-types/api";

type NotificationCardProps = {
  listItem: QuestionNotificationListItem;
  user: User;
  onUnsubscribe: (listItem: QuestionNotificationListItem) => void;
  onArchive: (listItem: QuestionNotificationListItem) => void;
  isEditable: boolean;
};

export const NotificationCard = ({
  listItem,
  user,
  isEditable,
  onUnsubscribe,
  onArchive,
}: NotificationCardProps): JSX.Element => {
  const { item } = listItem;
  const hasArchive = canArchive(listItem.item, user);

  const entityLink = Urls.question({
    id: item.payload.card_id,
    card_id: item.payload.card_id,
  });

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
            <Group gap="0.75rem" align="center" c="text-secondary">
              {enabledChannelsMap["channel/email"] && <Icon name="mail" />}
              {enabledChannelsMap["channel/slack"] && (
                <Icon name="slack" size={14} />
              )}
              {enabledChannelsMap["channel/http"] && (
                <Icon name="webhook" size={16} />
              )}
              <Group gap="0.25rem" align="center" c="text-secondary">
                {subscription && (
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
