export function channelIsValid(channel, channelSpec) {
  if (!channelSpec) {
    return false;
  }
  switch (channel.schedule_type) {
    case "monthly":
      if (channel.schedule_frame != null && channel.schedule_hour != null) {
        return true;
      }
    // these cases intentionally fall though
    // eslint-disable-next-line no-fallthrough
    case "weekly":
      if (channel.schedule_day == null) {
        return false;
      }
    // eslint-disable-next-line no-fallthrough
    case "daily":
      if (channel.schedule_hour == null) {
        return false;
      }
    // eslint-disable-next-line no-fallthrough
    case "hourly":
      break;
    default:
      return false;
  }
  if (channelSpec.recipients) {
    if (!channel.recipients) {
      return false;
    }
  }
  if (channelSpec.fields) {
    for (const field of channelSpec.fields) {
      if (
        field.required &&
        channel.details &&
        (channel.details[field.name] == null ||
          channel.details[field.name] === "")
      ) {
        return false;
      }
    }
  }
  return true;
}

export function pulseIsValid(pulse, channelSpecs) {
  return (
    (pulse.name &&
      pulse.cards.length > 0 &&
      pulse.channels.filter(c =>
        channelIsValid(c, channelSpecs && channelSpecs[c.channel_type]),
      ).length > 0) ||
    false
  );
}

export function emailIsEnabled(pulse) {
  return (
    pulse.channels.filter(c => c.channel_type === "email" && c.enabled).length >
    0
  );
}

export function cleanPulse(pulse, channelSpecs) {
  return {
    ...pulse,
    channels: pulse.channels.filter(c =>
      channelIsValid(c, channelSpecs && channelSpecs[c.channel_type]),
    ),
  };
}

export function getDefaultChannel(channelSpecs) {
  // email is the first choice
  if (channelSpecs.email.configured) {
    return channelSpecs.email;
  }
  // otherwise just pick the first configured
  for (const channelSpec of Object.values(channelSpecs)) {
    if (channelSpec.configured) {
      return channelSpec;
    }
  }
}

export function createChannel(channelSpec) {
  const details = {};

  return {
    channel_type: channelSpec.type,
    enabled: true,
    recipients: [],
    details: details,
    schedule_type: channelSpec.schedules[0],
    schedule_day: "mon",
    schedule_hour: 8,
    schedule_frame: "first",
  };
}
