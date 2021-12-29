import _ from "underscore";
import MetabaseSettings from "metabase/lib/settings";
import MetabaseUtils from "metabase/lib/utils";
import {
  hasDefaultParameterValue,
  hasParameterValue,
  normalizeParameterValue,
} from "metabase/parameters/utils/parameter-values";

export const NEW_PULSE_TEMPLATE = {
  name: null,
  cards: [],
  channels: [],
  skip_if_empty: false,
  collection_id: null,
  parameters: [],
};

export function channelIsValid(channel, channelSpec) {
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
        channel.details &&
        channel.details.channel &&
        fieldsAreValid(channel, channelSpec) &&
        scheduleIsValid(channel)
      );
    default:
      return false;
  }
}

export function scheduleIsValid(channel) {
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

  return true;
}

export function fieldsAreValid(channel, channelSpec) {
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

function pulseChannelsAreValid(pulse, channelSpecs) {
  return (
    pulse.channels.filter(c =>
      channelIsValid(c, channelSpecs && channelSpecs[c.channel_type]),
    ).length > 0 || false
  );
}

export function recipientIsValid(recipient) {
  if (recipient.id) {
    return true;
  }

  const recipientDomain = MetabaseUtils.getEmailDomain(recipient.email);
  const allowedDomains = MetabaseSettings.subscriptionAllowedDomains();
  return _.isEmpty(allowedDomains) || allowedDomains.includes(recipientDomain);
}

export function pulseIsValid(pulse, channelSpecs) {
  return (
    (pulse.name &&
      pulse.cards.length > 0 &&
      pulseChannelsAreValid(pulse, channelSpecs)) ||
    false
  );
}

export function dashboardPulseIsValid(pulse, channelSpecs) {
  return pulseChannelsAreValid(pulse, channelSpecs);
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
    channels: cleanPulseChannels(pulse.channels, channelSpecs),
    parameters: cleanPulseParameters(getPulseParameters(pulse)),
  };
}

function cleanPulseChannels(channels, channelSpecs) {
  return channels.filter(c =>
    channelIsValid(c, channelSpecs && channelSpecs[c.channel_type]),
  );
}

function cleanPulseParameters(parameters) {
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

export function getDefaultChannel(channelSpecs) {
  // email is the first choice
  if (channelSpecs.email && channelSpecs.email.configured) {
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

export function getPulseParameters(pulse) {
  return (pulse && pulse.parameters) || [];
}

// pulse parameters list cannot be trusted for existence/up-to-date defaults
// rely on given parameters list but take pulse parameter values if they are not null
export function getActivePulseParameters(pulse, parameters) {
  const pulseParameters = getPulseParameters(pulse);
  const pulseParametersById = _.indexBy(pulseParameters, "id");

  return parameters
    .map(parameter => {
      const pulseParameter = pulseParametersById[parameter.id];
      if (!pulseParameter && !hasDefaultParameterValue(parameter)) {
        return;
      }

      return {
        ...parameter,
        value: hasParameterValue(pulseParameter?.value)
          ? pulseParameter.value
          : parameter.default,
      };
    })
    .filter(Boolean);
}
