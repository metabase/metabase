import _ from "underscore";
import {
  hasDefaultParameterValue,
  hasParameterValue,
} from "metabase/meta/Parameter";

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
    // default from formInput is an empty array, not a null array
    // check for both
    if (!channel.recipients || channel.recipients.length < 1) {
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

function pulseChannelsAreValid(pulse, channelSpecs) {
  return (
    pulse.channels.filter(c =>
      channelIsValid(c, channelSpecs && channelSpecs[c.channel_type]),
    ).length > 0 || false
  );
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
    channels: pulse.channels.filter(c =>
      channelIsValid(c, channelSpecs && channelSpecs[c.channel_type]),
    ),
  };
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
        value: hasParameterValue(pulseParameter)
          ? pulseParameter.value
          : parameter.default,
      };
    })
    .filter(Boolean);
}
