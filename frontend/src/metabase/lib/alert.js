import { recipientIsValid, scheduleIsValid } from "metabase/lib/pulse";

export function channelIsValid(channel) {
  switch (channel.channel_type) {
    case "email":
      return (
        channel.recipients &&
        channel.recipients.length > 0 &&
        channel.recipients.every(recipientIsValid) &&
        scheduleIsValid(channel)
      );
    case "slack":
      return channel.details && scheduleIsValid(channel);
    default:
      return false;
  }
}

export function alertIsValid(alert) {
  return alert.channels.length > 0 && alert.channels.every(channelIsValid);
}
