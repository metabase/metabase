import type { JSX } from "react";
import { useCallback } from "react";
import { t } from "ttag";

import { formatCreatorMessage } from "metabase/account/notifications/components/NotificationCard/utils";
import type { DashboardAlertListItem } from "metabase/account/notifications/types";
import { Link } from "metabase/common/components/Link";
import { formatTitle } from "metabase/lib/notifications";
import { canArchiveLegacyAlert, formatChannel } from "metabase/lib/pulse";
import * as Urls from "metabase/lib/urls";
import type { Channel, User } from "metabase-types/api";

import {
  NotificationCardRoot,
  NotificationContent,
  NotificationDescription,
  NotificationIcon,
  NotificationMessage,
} from "./DashboardNotificationCard.styled";

type Props = {
  listItem: DashboardAlertListItem;
  user: User;
  onUnsubscribe: (listItem: DashboardAlertListItem) => void;
  onArchive: (listItem: DashboardAlertListItem) => void;
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
    <NotificationCardRoot>
      <NotificationContent>
        {dashboardEntityLink ? (
          <Link variant="brandBold" to={dashboardEntityLink}>
            {formatTitle(listItem)}
          </Link>
        ) : (
          formatTitle(listItem)
        )}
        <NotificationDescription>
          {item.channels.map((channel, index) => (
            <NotificationMessage key={index}>
              {getChannelMessage(channel)}
            </NotificationMessage>
          ))}
          <NotificationMessage data-server-date>
            {formatCreatorMessage(item, user.id)}
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

const getChannelMessage = (channel: Channel) => {
  return getCapitalizedMessage(formatChannel(channel));
};

const getCapitalizedMessage = (message: string) => {
  const [firstLetter, ...otherLetters] = message;
  return [firstLetter.toUpperCase(), ...otherLetters].join("");
};
