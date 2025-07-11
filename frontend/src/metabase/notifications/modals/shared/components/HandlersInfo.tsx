import { msgid, ngettext, t } from "ttag";
import _ from "underscore";

import { isNotFalsy } from "metabase/lib/types";
import {
  FixedSizeIcon,
  Group,
  Stack,
  type StackProps,
  Text,
} from "metabase/ui";
import type {
  NotificationChannel,
  NotificationHandlerEmail,
  NotificationHandlerHttp,
  NotificationHandlerSlack,
  User,
} from "metabase-types/api";

type HandlersInfoProps = {
  emailHandler?: NotificationHandlerEmail;
  slackHandler?: NotificationHandlerSlack;
  hookHandlers?: NotificationHandlerHttp[];
  users: User[] | undefined;
  httpChannelsConfig: NotificationChannel[] | undefined;
} & StackProps;
export const HandlersInfo = ({
  emailHandler,
  slackHandler,
  hookHandlers,
  users,
  httpChannelsConfig,
  ...stackProps
}: HandlersInfoProps) => {
  return (
    <Stack c="var(--mb-color-text-secondary)" gap="0.5rem" {...stackProps}>
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
  );
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
  return handler.recipients
    .map((recipient) => recipient.details.value)
    .join(", ");
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
