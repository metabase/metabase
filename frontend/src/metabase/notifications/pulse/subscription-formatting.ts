import { P, match } from "ts-pattern";
import { c, msgid, ngettext, t } from "ttag";
import _ from "underscore";

import { formatDateValue } from "metabase/parameters/utils/date-formatting";
import { renderNumberOfSelections } from "metabase/parameters/utils/formatting";
import { getActivePulseParameters } from "metabase/pulse";
import {
  deserializeBooleanParameterValue,
  deserializeNumberParameterValue,
  deserializeStringParameterValue,
  deserializeTemporalUnitParameterValue,
} from "metabase/querying/parameters/utils/parsing";
import { conjunct } from "metabase/utils/formatting";
import MetabaseSettings from "metabase/utils/settings";
import { formatFrame } from "metabase/utils/time-dayjs";
import { isNotNull } from "metabase/utils/types";
import {
  formatDateTimeWithUnit,
  formatTimeWithUnit,
} from "metabase/value-formatting";
import * as Lib from "metabase-lib";
import { getParameterType } from "metabase-lib/v1/parameters/utils/parameter-type";
import type {
  Channel,
  ChannelRecipient,
  DashboardSubscription,
  Parameter,
  ScheduleDayType,
  ScheduleFrameType,
} from "metabase-types/api";
import { isUserRecipient } from "metabase-types/guards";

type ChannelSchedule = Pick<
  Channel,
  "schedule_type" | "schedule_day" | "schedule_frame" | "schedule_hour"
>;

/**
 * A schedule with the fields its type needs. One that misses any is `unset`:
 * the API never saves such a schedule, so there is no send time to show.
 */
type SubscriptionSchedule =
  | { type: "hourly" }
  | { type: "daily"; hour: number }
  | { type: "weekly"; day: ScheduleDayType; hour: number }
  | {
      type: "monthly";
      frame: ScheduleFrameType;
      day: ScheduleDayType | null;
      hour: number;
    }
  | { type: "unset" };

type SetSubscriptionSchedule = Exclude<SubscriptionSchedule, { type: "unset" }>;

function getSubscriptionSchedule({
  schedule_type,
  schedule_day,
  schedule_frame,
  schedule_hour,
}: ChannelSchedule): SubscriptionSchedule {
  return match({ schedule_type, schedule_day, schedule_frame, schedule_hour })
    .returnType<SubscriptionSchedule>()
    .with({ schedule_type: "hourly" }, () => ({ type: "hourly" }))
    .with(
      { schedule_type: "daily", schedule_hour: P.number },
      ({ schedule_hour }) => ({ type: "daily", hour: schedule_hour }),
    )
    .with(
      {
        schedule_type: "weekly",
        schedule_day: P.nonNullable,
        schedule_hour: P.number,
      },
      ({ schedule_day, schedule_hour }) => ({
        type: "weekly",
        day: schedule_day,
        hour: schedule_hour,
      }),
    )
    .with(
      {
        schedule_type: "monthly",
        schedule_frame: P.nonNullable,
        schedule_hour: P.number,
      },
      ({ schedule_day, schedule_frame, schedule_hour }) => ({
        type: "monthly",
        frame: schedule_frame,
        day: schedule_day ?? null,
        hour: schedule_hour,
      }),
    )
    .otherwise(() => ({ type: "unset" }));
}

// The instance's time format settings decide between 12- and 24-hour times
function formatHour(hour: number): string {
  return formatTimeWithUnit(
    hour,
    "hour-of-day",
    MetabaseSettings.formattingOptions(),
  );
}

function formatDayOfWeek(day: ScheduleDayType) {
  return formatDateTimeWithUnit(
    day,
    "day-of-week",
    MetabaseSettings.formattingOptions(),
  );
}

const WEEKLY_SCHEDULES: Record<ScheduleDayType, (hour: string) => string> = {
  sun: (hour) => t`Sundays at ${hour}`,
  mon: (hour) => t`Mondays at ${hour}`,
  tue: (hour) => t`Tuesdays at ${hour}`,
  wed: (hour) => t`Wednesdays at ${hour}`,
  thu: (hour) => t`Thursdays at ${hour}`,
  fri: (hour) => t`Fridays at ${hour}`,
  sat: (hour) => t`Saturdays at ${hour}`,
};

/** When a subscription sends, as a title, like "Daily at 8:00 AM". */
export function formatSubscriptionSchedule(channel: ChannelSchedule): string {
  return match(getSubscriptionSchedule(channel))
    .with({ type: "hourly" }, () => t`Hourly`)
    .with({ type: "daily" }, ({ hour }) => t`Daily at ${formatHour(hour)}`)
    .with({ type: "weekly" }, ({ day, hour }) =>
      WEEKLY_SCHEDULES[day](formatHour(hour)),
    )
    .with({ type: "monthly", day: P.nullish }, ({ frame, hour }) => {
      const frameText = formatFrame(frame);
      const hourText = formatHour(hour);
      return t`Monthly on the ${frameText} calendar day at ${hourText}`;
    })
    .with({ type: "monthly", day: P.nonNullable }, ({ frame, day, hour }) => {
      const frameText = formatFrame(frame);
      const dayText = formatDayOfWeek(day);
      const hourText = formatHour(hour);
      return t`Monthly on the ${frameText} ${dayText} at ${hourText}`;
    })
    .with({ type: "unset" }, () => t`Schedule not set`)
    .exhaustive();
}

/**
 * How and when a subscription sends, like "Emailed daily at 8:00 AM" or
 * "Sent to #sales hourly".
 */
export function formatSubscriptionDelivery(
  channel: ChannelSchedule & Pick<Channel, "channel_type" | "details">,
): string {
  const schedule = getSubscriptionSchedule(channel);
  if (schedule.type === "unset") {
    return t`Schedule not set`;
  }
  const when = formatScheduleInSentence(schedule);
  const slackChannel = channel.details?.channel;
  return match(channel.channel_type)
    .with(
      "email",
      () =>
        c("{0} is when a subscription sends, like 'daily at 8:00 AM'")
          .t`Emailed ${when}`,
    )
    .with("slack", () =>
      slackChannel
        ? c(
            "{0} is a Slack channel, and {1} is when a subscription sends, like 'daily at 8:00 AM'",
          ).t`Sent to ${slackChannel} ${when}`
        : c("{0} is when a subscription sends, like 'daily at 8:00 AM'")
            .t`Sent ${when}`,
    )
    .with(
      "http",
      () =>
        c("{0} is when a subscription sends, like 'daily at 8:00 AM'")
          .t`Sent ${when}`,
    )
    .exhaustive();
}

function formatScheduleInSentence(schedule: SetSubscriptionSchedule): string {
  return match(schedule)
    .with({ type: "hourly" }, () => t`hourly`)
    .with({ type: "daily" }, ({ hour }) => {
      const hourText = formatHour(hour);
      return t`daily at ${hourText}`;
    })
    .with({ type: "weekly" }, ({ day, hour }) => {
      const dayText = formatDayOfWeek(day);
      const hourText = formatHour(hour);
      return c("{0} is a day of the week, and {1} is a time of day")
        .t`${dayText} at ${hourText}`;
    })
    .with({ type: "monthly", day: P.nullish }, ({ frame, hour }) => {
      const frameText = formatFrame(frame);
      const hourText = formatHour(hour);
      return t`monthly on the ${frameText} calendar day at ${hourText}`;
    })
    .with({ type: "monthly", day: P.nonNullable }, ({ frame, day, hour }) => {
      const frameText = formatFrame(frame);
      const dayText = formatDayOfWeek(day);
      const hourText = formatHour(hour);
      return t`monthly on the ${frameText} ${dayText} at ${hourText}`;
    })
    .exhaustive();
}

export type SubscriptionRecipient =
  | { type: "user"; name: string; email: string }
  | { type: "external"; email: string };

/**
 * A channel's recipients, each address once. An address saved both as a user
 * and as a plain email is listed as the user.
 */
export function getChannelRecipients(
  channel: Pick<Channel, "recipients">,
): SubscriptionRecipient[] {
  const recipients = (channel.recipients ?? []).map(getRecipient);
  const userEmails = new Set(
    recipients
      .filter((recipient) => recipient.type === "user")
      .map((recipient) => recipient.email),
  );
  // /api/pulse lists an address twice when it was saved both as a user and as a plain email
  const withoutShadowedExternals = recipients.filter(
    (recipient) =>
      recipient.type === "user" || !userEmails.has(recipient.email),
  );
  return _.uniq(
    withoutShadowedExternals,
    false,
    (recipient) => recipient.email,
  );
}

function getRecipient(recipient: ChannelRecipient): SubscriptionRecipient {
  return isUserRecipient(recipient)
    ? {
        type: "user",
        name: getRecipientName(recipient),
        email: recipient.email,
      }
    : { type: "external", email: recipient.email };
}

/**
 * The first email recipient and how many more there are, counted as
 * `getChannelRecipients` lists them, or an empty string when there are none.
 */
export function buildRecipientText({
  channels: [firstChannel],
}: Pick<DashboardSubscription, "channels">): string {
  if (firstChannel?.channel_type !== "email") {
    return "";
  }

  const [firstRecipient, ...otherRecipients] =
    getChannelRecipients(firstChannel);
  if (firstRecipient == null) {
    return "";
  }

  const firstRecipientText =
    firstRecipient.type === "user" ? firstRecipient.name : firstRecipient.email;
  const otherCount = otherRecipients.length;
  return otherCount === 0
    ? firstRecipientText
    : ngettext(
        msgid`${firstRecipientText} and ${otherCount} other`,
        `${firstRecipientText} and ${otherCount} others`,
        otherCount,
      );
}

/** A Metabase user's name, or the address of a recipient outside Metabase. */
export function getRecipientName(recipient: ChannelRecipient): string {
  return isUserRecipient(recipient)
    ? recipient.common_name || recipient.email
    : recipient.email;
}

/**
 * A filter's values deserialized by its parameter type and shown as a filter
 * widget shows them. Empty when none of them parses.
 */
function getFilterValues(parameter: Parameter): string[] {
  const { value } = parameter;
  return match(getParameterType(parameter))
    .returnType<string[]>()
    .with("date", () => {
      const dateText = formatDateValue(parameter, value);
      return dateText != null ? [dateText] : [];
    })
    .with("temporal-unit", () => {
      const unit = deserializeTemporalUnitParameterValue(value);
      return unit != null ? [Lib.describeTemporalUnit(unit)] : [];
    })
    .with("number", () =>
      deserializeNumberParameterValue(parameter.type, value)
        .filter(isNotNull)
        .map(String),
    )
    .with("boolean", () => deserializeBooleanParameterValue(value).map(String))
    .otherwise(() => deserializeStringParameterValue(value));
}

/**
 * The subscription's active filters, without any whose value doesn't parse,
 * as there is no value to show for it.
 */
export function getActiveFilters(
  pulse: DashboardSubscription,
  parameters: Parameter[],
): Parameter[] {
  return getActivePulseParameters(pulse, parameters).filter(
    (parameter) => getFilterValues(parameter).length > 0,
  );
}

/** A filter with every value it sends, like "State: CA and NY". */
export function formatFilter(parameter: Parameter): string {
  return `${parameter.name}: ${conjunct(getFilterValues(parameter), t`and`)}`;
}

/**
 * The first active filter, with a multi-value one counted rather than listed,
 * and how many other filters there are, or an empty string when none is active.
 */
export function buildFilterText(
  pulse: DashboardSubscription,
  parameters: Parameter[],
): string {
  const activeParameters = getActiveFilters(pulse, parameters);

  if (_.isEmpty(activeParameters)) {
    return "";
  }

  const [firstParameter, ...otherParameters] = activeParameters;
  const firstValueCount = getFilterValues(firstParameter).length;
  const firstFilterText =
    firstValueCount > 1
      ? `${firstParameter.name}: ${renderNumberOfSelections(firstValueCount)}`
      : formatFilter(firstParameter);

  return _.isEmpty(otherParameters)
    ? firstFilterText
    : `${firstFilterText} ${ngettext(
        msgid`and ${otherParameters.length} more filter`,
        `and ${otherParameters.length} more filters`,
        otherParameters.length,
      )}`;
}
