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
    case "http":
      return channel.channel_id && scheduleIsValid(channel);
    default:
      return false;
  }
}

export function channelIsEnabled(channel) {
  return channel.enabled;
}

export function alertIsValid(alert) {
  const enabledChannels = alert.channels.filter(channelIsEnabled);
  return enabledChannels.length > 0 && enabledChannels.every(channelIsValid);
}
