import React, { useCallback } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import Settings from "metabase/lib/settings";
import { formatDay, formatFrame, formatHourAMPM } from "metabase/lib/time";
import { formatDateTimeWithUnit } from "metabase/lib/formatting";
import * as Urls from "metabase/lib/urls";
import {
  NotificationContent,
  NotificationDescription,
  NotificationIcon,
  NotificationItemRoot,
  NotificationTitle,
} from "./NotificationCard.styled";

const propTypes = {
  item: PropTypes.object.isRequired,
  type: PropTypes.oneOf(["pulse", "alert"]).isRequired,
  user: PropTypes.object,
  onUnsubscribe: PropTypes.func,
  onArchive: PropTypes.func,
};

const NotificationCard = ({ item, type, user, onUnsubscribe, onArchive }) => {
  const onRemoveClick = useCallback(() => {
    if (isSubscribed(item, user)) {
      onUnsubscribe(item, type);
    } else {
      onArchive(item, type);
    }
  }, [item, type, user, onUnsubscribe, onArchive]);

  return (
    <NotificationItemRoot>
      <NotificationContent>
        <NotificationTitle to={formatLink(item, type)}>
          {formatTitle(item, type)}
        </NotificationTitle>
        <NotificationDescription>
          {formatDescription(item, user)}
        </NotificationDescription>
      </NotificationContent>
      <NotificationIcon name="close" onClick={onRemoveClick} />
    </NotificationItemRoot>
  );
};

NotificationCard.propTypes = propTypes;

const isSubscribed = (item, user) => {
  return item.channels.some(channel =>
    channel.recipients.some(recipient => recipient.id === user.id),
  );
};

const formatTitle = (item, type) => {
  switch (type) {
    case "pulse":
      return item.name;
    case "alert":
      return item.card.name;
  }
};

const formatLink = (item, type) => {
  switch (type) {
    case "pulse":
      return Urls.dashboard({ id: item.dashboard_id });
    case "alert":
      return Urls.question(item.card);
  }
};

const formatDescription = (item, user) => {
  const parts = [
    ...item.channels.map(formatChannel),
    formatCreator(item, user),
  ];

  return parts.join(" · ");
};

const formatChannel = channel => {
  let scheduleString = "";

  switch (channel.channel_type) {
    case "email":
      scheduleString += t`Emailed `;
      break;
    case "slack":
      scheduleString += t`Slack’d `;
      break;
    default:
      scheduleString += t`Sent`;
      break;
  }

  switch (channel.schedule_type) {
    case "hourly":
      scheduleString += t`hourly`;
      break;
    case "daily": {
      const ampm = formatHourAMPM(channel.schedule_hour);
      scheduleString += t`daily at ${ampm}`;
      break;
    }
    case "weekly": {
      const ampm = formatHourAMPM(channel.schedule_hour);
      const day = formatDay(channel.schedule_day);
      scheduleString += t`${day} at ${ampm}`;
      break;
    }
    case "monthly": {
      const ampm = formatHourAMPM(channel.schedule_hour);
      const day = formatDay(channel.schedule_day);
      const frame = formatFrame(channel.schedule_frame);
      scheduleString += t`monthly on the ${frame} ${day} at ${ampm}`;
      break;
    }
  }

  if (channel.channel_type === "slack") {
    scheduleString += t` to ${channel.details.channel}`;
  }

  return scheduleString;
};

const formatCreator = (item, user) => {
  let creatorString = "";
  const options = Settings.formattingOptions();

  if (user?.id === item.creator?.id) {
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
