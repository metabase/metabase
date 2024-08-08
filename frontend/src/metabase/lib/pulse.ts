import _ from "underscore";

import { getEmailDomain } from "metabase/lib/email";
import MetabaseSettings from "metabase/lib/settings";
import {
  getDefaultValuePopulatedParameters,
  normalizeParameterValue,
} from "metabase-lib/v1/parameters/utils/parameter-values";
import type {
  Channel,
  ChannelSpec,
  NotificationRecipient,
  Pulse,
  PulseParameter,
} from "metabase-types/api";

export const NEW_PULSE_TEMPLATE = {
  name: null,
  cards: [],
  channels: [],
  skip_if_empty: false,
  collection_id: null,
  parameters: [],
};

export function channelIsValid(channel: Channel, channelSpec: ChannelSpec) {
  switch (channel.channel_type) {
    case "email":
      return (
        channel.recipients &&
        channel.recipients.length > 0 &&
        channel.recipients.every(recipientIsValid) &&
        fieldsAreValid(channel, channelSpec) &&
        scheduleIsValid(channel)
      );
    case "slack":
      return (
        channel.details?.channel &&
        fieldsAreValid(channel, channelSpec) &&
        scheduleIsValid(channel)
      );
    default:
      return false;
  }
}

export function scheduleIsValid(channel: Channel) {
  switch (channel.schedule_type) {
    case "monthly":
      if (channel.schedule_frame != null && channel.schedule_hour != null) {
        return true;
      }
    // these cases intentionally fall though
    /* eslint-disable no-fallthrough */
    case "weekly":
      if (channel.schedule_day == null) {
        return false;
      }
    case "daily":
      if (channel.schedule_hour == null) {
        return false;
      }
    case "hourly":
      break;
    default:
      return false;
    /* eslint-enable no-fallthrough */
  }

  return true;
}

export function fieldsAreValid(channel: Channel, channelSpec: ChannelSpec) {
  if (!channelSpec) {
    return false;
  }

  if (!channelSpec.fields) {
    return true;
  }

  return channelSpec.fields
    .filter(field => field.required)
    .every(field => Boolean(channel.details?.[field.name]));
}

function pulseChannelsAreValid(pulse: Pulse, channelSpecs: any) {
  return (
    pulse.channels.filter(channel =>
      channelIsValid(channel, channelSpecs?.[channel.channel_type]),
    ).length > 0 || false
  );
}

export function recipientIsValid(recipient: NotificationRecipient) {
  if (recipient.id) {
    return true;
  }

  const recipientDomain = getEmailDomain(recipient.email);
  const allowedDomains = MetabaseSettings.subscriptionAllowedDomains();
  return (
    _.isEmpty(allowedDomains) ||
    (recipientDomain && allowedDomains.includes(recipientDomain))
  );
}

export function pulseIsValid(pulse: Pulse, channelSpecs: ChannelSpecs) {
  return (
    (pulse.name &&
      pulse.cards.length > 0 &&
      pulseChannelsAreValid(pulse, channelSpecs)) ||
    false
  );
}

export function dashboardPulseIsValid(
  pulse: Pulse,
  channelSpecs: ChannelSpecs,
) {
  return pulseChannelsAreValid(pulse, channelSpecs);
}

export function emailIsEnabled(pulse: Pulse) {
  return (
    pulse.channels.filter(
      channel => channel.channel_type === "email" && channel.enabled,
    ).length > 0
  );
}

export function cleanPulse(pulse: Pulse, channelSpecs: any) {
  return {
    ...pulse,
    channels: cleanPulseChannels(pulse.channels, channelSpecs),
    parameters: cleanPulseParameters(getPulseParameters(pulse)),
  };
}

function cleanPulseChannels(channels: Channel[], channelSpecs: any) {
  return channels.filter(channel =>
    channelIsValid(channel, channelSpecs?.[channel.channel_type]),
  );
}

function cleanPulseParameters(parameters: PulseParameter[]) {
  return parameters.map(parameter => {
    const { default: defaultValue, name, slug, type, value, id } = parameter;
    const normalizedValue = normalizeParameterValue(type, value);

    return {
      default: defaultValue,
      id,
      name,
      slug,
      type,
      value: normalizedValue,
    };
  });
}

type ChannelSpecs = {
  email?: {
    configured: boolean;
  };
};

export function getDefaultChannel(channelSpecs: ChannelSpecs) {
  // email is the first choice
  if (channelSpecs.email?.configured) {
    return channelSpecs.email;
  }
  // otherwise just pick the first configured
  for (const channelSpec of Object.values(channelSpecs)) {
    if (channelSpec.configured) {
      return channelSpec;
    }
  }
}

export function createChannel(channelSpec: ChannelSpec) {
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

export function getPulseParameters(pulse: Pulse) {
  return pulse?.parameters || [];
}

// pulse parameters list cannot be trusted for existence/up-to-date defaults
// rely on given parameters list but take pulse parameter values if they are not null
export function getActivePulseParameters(
  pulse: Pulse,
  parameters: PulseParameter[],
) {
  const parameterValues = getPulseParameters(pulse).reduce((map, parameter) => {
    map[parameter.id] = parameter.value;
    return map;
  }, {});
  return getDefaultValuePopulatedParameters(parameters, parameterValues).filter(
    (parameter: any) => parameter.value != null,
  );
}
