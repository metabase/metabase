import type { JSX } from "react";
import { useCallback } from "react";
import { t } from "ttag";

import { formatCreatorMessage } from "metabase/account/notifications/components/NotificationCard/utils";
import type { DashboardSubscriptionListItem } from "metabase/account/notifications/types";
import { Link } from "metabase/common/components/Link";
import { formatTitle } from "metabase/notifications/utils";
import { canArchiveLegacyAlert, formatChannel } from "metabase/pulse";
import { Box, Flex, Icon, Text } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Channel, User } from "metabase-types/api";

import S from "./DashboardNotificationCard.module.css";

type Props = {
  listItem: DashboardSubscriptionListItem;
  user: User;
  onUnsubscribe: (listItem: DashboardSubscriptionListItem) => void;
  onArchive: (listItem: DashboardSubscriptionListItem) => void;
  isEditable: boolean;
};

export const DashboardNotificationCard = ({
  listItem,
  user,
  isEditable,
  onUnsubscribe,
  onArchive,
}: Props): JSX.Element => {
  const hasArchive = canArchiveLegacyAlert(listItem.item, user);
  const { item } = listItem;

  const dashboardEntityLink = item.dashboard_id
    ? Urls.dashboard({ id: item.dashboard_id })
    : null;

  const onUnsubscribeClick = useCallback(() => {
    onUnsubscribe(listItem);
  }, [listItem, onUnsubscribe]);

  const onArchiveClick = useCallback(() => {
    onArchive(listItem);
  }, [listItem, onArchive]);

  return (
    <Flex
      className={S.root}
      align="center"
      px="lg"
      py="md"
      bg="background-primary"
    >
      <Box flex="1 1 auto">
        {dashboardEntityLink ? (
          <Link variant="brandBold" to={dashboardEntityLink}>
            {formatTitle(listItem)}
          </Link>
        ) : (
          formatTitle(listItem)
        )}
        <Flex wrap="wrap" mt="xs">
          {item.channels.map((channel, index) => (
            <Text
              key={index}
              component="span"
              className={S.message}
              c="text-secondary"
              fz="sm"
              lh="0.875rem"
            >
              {getChannelMessage(channel)}
            </Text>
          ))}
          <Text
            component="span"
            className={S.message}
            c="text-secondary"
            fz="sm"
            lh="0.875rem"
            data-server-date
          >
            {formatCreatorMessage(item, user.id)}
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

const getChannelMessage = (channel: Channel) => {
  return getCapitalizedMessage(formatChannel(channel));
};

const getCapitalizedMessage = (message: string) => {
  const [firstLetter, ...otherLetters] = message;
  return [firstLetter.toUpperCase(), ...otherLetters].join("");
};
