import { msgid, ngettext, t } from "ttag";
import _ from "underscore";

import { getEmailDomain } from "metabase/lib/email";
import { formatDateTimeWithUnit } from "metabase/lib/formatting/date";
import { formatTimeWithUnit } from "metabase/lib/formatting/time";
import MetabaseSettings from "metabase/lib/settings";
import { formatFrame } from "metabase/lib/time";
import {
  getDefaultValuePopulatedParameters,
  normalizeParameterValue,
} from "metabase-lib/v1/parameters/utils/parameter-values";
import type {
  Alert,
  Channel,
  ChannelApiResponse,
  ChannelSpec,
  Pulse,
  PulseParameter,
  ScheduleSettings,
  User,
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
    case "http":
      return channel.channel_id && scheduleIsValid(channel);
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

export type RecipientPickerValue = (User | { email: string }) & {
  entityId?: number;
};

export function recipientIsValid(recipient: RecipientPickerValue) {
  if ("id" in recipient && recipient.id) {
    // user entity, added to the platform, no need to validate email
    return true;
  }

  const recipientDomain = getEmailDomain(recipient.email);
  const allowedDomains = MetabaseSettings.subscriptionAllowedDomains();
  return (
    _.isEmpty(allowedDomains) ||
    !!(recipientDomain && allowedDomains.includes(recipientDomain))
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

export function createChannel(
  channelSpec: ChannelSpec,
  opts?: Partial<Channel>,
): Channel {
  return {
    channel_type: channelSpec.type,
    enabled: true,
    recipients: [],
    schedule_type: channelSpec.schedules[0],
    schedule_day: "mon",
    schedule_hour: 8,
    schedule_frame: "first",
    ...opts,
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

export const formatChannel = (channel: Channel): string => {
  const parts = [
    formatChannelType(channel),
    formatChannelSchedule(channel),
    formatChannelDetails(channel),
  ];

  return parts.filter(p => p).join(" ");
};

export const formatChannelType = ({ channel_type }: Channel): string => {
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
}: ScheduleSettings) => {
  const options = MetabaseSettings.formattingOptions();

  switch (schedule_type) {
    case "hourly":
      return t`hourly`;
    case "daily": {
      if (schedule_hour != null) {
        const ampm = formatTimeWithUnit(schedule_hour, "hour-of-day", options);
        return t`daily at ${ampm}`;
      }
      break;
    }
    case "weekly": {
      if (schedule_hour != null && schedule_day != null) {
        const ampm = formatTimeWithUnit(schedule_hour, "hour-of-day", options);
        const day = formatDateTimeWithUnit(
          schedule_day,
          "day-of-week",
          options,
        );
        return t`${day} at ${ampm}`;
      }
      break;
    }
    case "monthly": {
      if (
        schedule_hour != null &&
        schedule_day != null &&
        schedule_frame != null
      ) {
        const ampm = formatTimeWithUnit(schedule_hour, "hour-of-day", options);
        const day = formatDateTimeWithUnit(
          schedule_day,
          "day-of-week",
          options,
        );
        const frame = formatFrame(schedule_frame);
        return t`monthly on the ${frame} ${day} at ${ampm}`;
      }
      break;
    }
  }
};

export const formatChannelDetails = ({ channel_type, details }: Channel) => {
  if (channel_type === "slack" && details) {
    return `to ${details.channel}`;
  }
};

export const formatChannelRecipients = (item: Alert) => {
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

export const getRecipientsCount = (
  item: Alert,
  channelType: "email" | "slack",
) => {
  return item.channels
    .filter(channel => channel.channel_type === channelType)
    .reduce((total, channel) => total + (channel.recipients?.length || 0), 0);
};

export const canArchiveLegacyAlert = (item: Alert, user: User): boolean => {
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

export const getHasConfiguredAnyChannel = (
  formInput: ChannelApiResponse | undefined,
) =>
  (formInput?.channels &&
    _.some(Object.values(formInput.channels), c => c.configured)) ||
  false;

export const getHasConfiguredEmailChannel = (
  formInput: ChannelApiResponse | undefined,
) =>
  (formInput?.channels &&
    _.some(
      Object.values(formInput.channels),
      c => c.type === "email" && c.configured,
    )) ||
  false;
