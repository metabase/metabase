import { type JSX, useCallback } from "react";
import { t } from "ttag";

import { formatCreatorMessage } from "metabase/account/notifications/components/NotificationCard/utils";
import type { QuestionNotificationListItem } from "metabase/account/notifications/types";
import { Link } from "metabase/common/components/Link/Link";
import {
  canArchive,
  formatNotificationSchedule,
  formatTitle,
  getNotificationEnabledChannelsMap,
} from "metabase/notifications/utils";
import { Box, Flex, Group, Icon, Text } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { User } from "metabase-types/api";

import S from "./DashboardNotificationCard.module.css";

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

  const entityLink = Urls.card({
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
    <Flex
      className={S.root}
      data-testid="notification-alert-item"
      align="center"
      px="lg"
      py="md"
      bg="background-primary"
    >
      <Box flex="1 1 auto">
        <Link variant="brandBold" to={entityLink}>
          {formatTitle(listItem)}
        </Link>
        <Flex wrap="wrap" mt="xs">
          <Text
            component="span"
            className={S.message}
            c="text-secondary"
            fz="sm"
            lh="0.875rem"
          >
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
          </Text>
        </Flex>
      </Box>

      {isEditable && !hasArchive && (
        <Icon
          className={S.icon}
          name="close"
          size={16}
          c="text-tertiary"
          tooltip={t`Unsubscribe`}
          onClick={onUnsubscribeClick}
        />
      )}
      {isEditable && hasArchive && (
        <Icon
          className={S.icon}
          name="close"
          size={16}
          c="text-tertiary"
          tooltip={t`Delete`}
          onClick={onArchiveClick}
        />
      )}
    </Flex>
  );
};
