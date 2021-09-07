import React, { useCallback } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import Settings from "metabase/lib/settings";
import { capitalize, formatDateTimeWithUnit } from "metabase/lib/formatting";
import {
  canArchive,
  formatChannel,
  formatLink,
  formatTitle,
} from "metabase/lib/notifications";
import {
  NotificationContent,
  NotificationIcon,
  NotificationDescription,
  NotificationItemRoot,
  NotificationMessage,
  NotificationTitle,
} from "./NotificationCard.styled";

const propTypes = {
  item: PropTypes.object.isRequired,
  type: PropTypes.oneOf(["pulse", "alert"]).isRequired,
  user: PropTypes.object.isRequired,
  onUnsubscribe: PropTypes.func,
  onArchive: PropTypes.func,
};

const NotificationCard = ({ item, type, user, onUnsubscribe, onArchive }) => {
  const hasArchive = canArchive(item, user);

  const onUnsubscribeClick = useCallback(() => {
    onUnsubscribe(item, type);
  }, [item, type, onUnsubscribe]);

  const onArchiveClick = useCallback(() => {
    onArchive(item, type);
  }, [item, type, onArchive]);

  return (
    <NotificationItemRoot>
      <NotificationContent>
        <NotificationTitle to={formatLink(item, type)}>
          {formatTitle(item, type)}
        </NotificationTitle>
        <NotificationDescription>
          {item.channels.map((channel, index) => (
            <NotificationMessage key={index}>
              {getChannelMessage(channel)}
            </NotificationMessage>
          ))}
          <NotificationMessage>
            {getCreatorMessage(item, user)}
          </NotificationMessage>
        </NotificationDescription>
      </NotificationContent>
      {!hasArchive && (
        <NotificationIcon
          name="close"
          tooltip={t`Unsubscribe`}
          onClick={onUnsubscribeClick}
        />
      )}
      {hasArchive && (
        <NotificationIcon
          name="close"
          tooltip={t`Delete`}
          onClick={onArchiveClick}
        />
      )}
    </NotificationItemRoot>
  );
};

NotificationCard.propTypes = propTypes;

const getChannelMessage = channel => {
  return capitalize(formatChannel(channel));
};

const getCreatorMessage = (item, user) => {
  let creatorString = "";
  const options = Settings.formattingOptions();

  if (user.id === item.creator?.id) {
    creatorString += t`Created by you`;
  } else if (item.creator?.common_name) {
    creatorString += t`Created by ${item.creator.common_name}`;
  } else {
    creatorString += t`Created`;
  }

  if (item.created_at) {
    const createdAt = formatDateTimeWithUnit(item.created_at, "day", options);
    creatorString += t` on ${createdAt}`;
  }

  return creatorString;
};

export default NotificationCard;
