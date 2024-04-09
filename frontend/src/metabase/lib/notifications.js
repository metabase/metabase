import { msgid, ngettext, t } from "ttag";

import {
  formatDateTimeWithUnit,
  formatTimeWithUnit,
} from "metabase/lib/formatting";
import Settings from "metabase/lib/settings";
import { formatFrame } from "metabase/lib/time";
import * as Urls from "metabase/lib/urls";

export const formatTitle = (item, type) => {
  switch (type) {
    case "pulse":
      return item.name;
    case "alert":
      return item.card.name;
  }
};

export const formatLink = (item, type) => {
  switch (type) {
    case "pulse":
      return Urls.dashboard({ id: item.dashboard_id });
    case "alert":
      return Urls.question(item.card);
  }
};

export const formatChannel = channel => {
  const parts = [
    formatChannelType(channel),
    formatChannelSchedule(channel),
    formatChannelDetails(channel),
  ];

  return parts.filter(p => p).join(" ");
};

export const formatChannels = channels => {
  return channels.map(channel => formatChannel(channel)).join(", ");
};

export const formatChannelType = ({ channel_type }) => {
  switch (channel_type) {
    case "email":
      return t`emailed`;
    case "slack":
      return t`slack’d`;
    default:
      return t`sent`;
  }
};

export const formatChannelSchedule = ({
  schedule_type,
  schedule_hour,
  schedule_day,
  schedule_frame,
}) => {
  const options = Settings.formattingOptions();

  switch (schedule_type) {
    case "hourly":
      return t`hourly`;
    case "daily": {
      const ampm = formatTimeWithUnit(schedule_hour, "hour-of-day", options);
      return t`daily at ${ampm}`;
    }
    case "weekly": {
      const ampm = formatTimeWithUnit(schedule_hour, "hour-of-day", options);
      const day = formatDateTimeWithUnit(schedule_day, "day-of-week", options);
      return t`${day} at ${ampm}`;
    }
    case "monthly": {
      const ampm = formatTimeWithUnit(schedule_hour, "hour-of-day", options);
      const day = formatDateTimeWithUnit(schedule_day, "day-of-week", options);
      const frame = formatFrame(schedule_frame);
      return t`monthly on the ${frame} ${day} at ${ampm}`;
    }
  }
};

export const formatChannelDetails = ({ channel_type, details }) => {
  if (channel_type === "slack" && details) {
    return `to ${details.channel}`;
  }
};

export const formatChannelRecipients = item => {
  const emailCount = getRecipientsCount(item, "email");
  const slackCount = getRecipientsCount(item, "slack");

  const emailMessage = ngettext(
    msgid`${emailCount} email`,
    `${emailCount} emails`,
    emailCount,
  );

  const slackMessage = ngettext(
    msgid`${slackCount} Slack channel`,
    `${slackCount} Slack channels`,
    slackCount,
  );

  if (emailCount && slackCount) {
    return t`${emailMessage} and ${slackMessage}.`;
  } else if (emailCount) {
    return emailMessage;
  } else if (slackCount) {
    return slackMessage;
  }
};

export const getRecipientsCount = (item, channelType) => {
  return item.channels
    .filter(channel => channel.channel_type === channelType)
    .reduce((total, channel) => total + channel.recipients.length, 0);
};

export const canArchive = (item, user) => {
  const recipients = item.channels.flatMap(channel => {
    if (channel.recipients) {
      return channel.recipients.map(recipient => recipient.id);
    } else {
      return [];
    }
  });

  const isCreator = item.creator?.id === user.id;
  const isSubscribed = recipients.includes(user.id);
  const isOnlyRecipient = recipients.length === 1;

  return isCreator && (!isSubscribed || isOnlyRecipient);
};
