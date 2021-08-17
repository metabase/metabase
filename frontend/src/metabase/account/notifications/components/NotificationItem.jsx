import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import {
  NotificationItemRoot,
  NotificationDescription,
} from "./NotificationItem.styled";
import {
  formatDay,
  formatFrame,
  formatHourAMPM,
  parseTimestamp,
} from "metabase/lib/time";

const propTypes = {
  item: PropTypes.object.isRequired,
  user: PropTypes.object.isRequired,
};

const NotificationItem = ({ item, user }) => {
  return (
    <NotificationItemRoot>
      <NotificationDescription>
        {formatDescription(item, user)}
      </NotificationDescription>
    </NotificationItemRoot>
  );
};

NotificationItem.propTypes = propTypes;

const formatDescription = (item, user) => {
  const parts = [
    ...item.channels.map(formatChannel),
    formatCreator(item.creator, user),
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
      scheduleString += `Sent `;
      break;
  }

  switch (channel.schedule_type) {
    case "hourly":
      scheduleString += `hourly`;
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
    default:
      scheduleString += channel.schedule_type;
      break;
  }

  if (channel.channel_type === "slack") {
    scheduleString += t` to ${channel.details.channel}`;
  }

  return scheduleString;
};

const formatCreator = (creator, user) => {
  let creatorString = "";

  if (user.id === creator?.id) {
    creatorString += t`Created by you`;
  } else if (creator?.common_name) {
    creatorString += t`Created by ${creator.common_name}`;
  } else {
    creatorString += t`Created`;
  }

  if (creator.created_at) {
    const createdAt = parseTimestamp(creator.created_at).format("L");
    creatorString += t` on ${createdAt}`;
  }

  return creatorString;
};

export default NotificationItem;
