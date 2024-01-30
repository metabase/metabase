import _ from "underscore";
import { c, t } from "ttag";
import dayjs from "dayjs";
import updateLocale from "dayjs/plugin/updateLocale";
import relativeTime from "dayjs/plugin/relativeTime";

import { Text, Tooltip } from "metabase/ui";
import { formatDateTimeWithUnit } from "metabase/lib/formatting";

dayjs.extend(updateLocale);
dayjs.extend(relativeTime);

/** Contextualize a msgid string related to a unit of time, for the benefit of
 * our translators. This is useful because it might be hard to know how to
 * translate a string like '{0}d' without additional context. */
const giveContext = (unit: string) =>
  c(
    `Abbreviation for "{0} ${unit}(s)". Keep abbreviations distinct from one another.`,
  );

/** @see https://day.js.org/docs/en/customization/customization */
const timeFormattingRules: Record<string, unknown> = {
  m: giveContext("minute").t`${"%d"}min`,
  mm: giveContext("minute").t`${"%d"}min`,
  h: giveContext("hour").t`${1}h`,
  hh: giveContext("hour").t`${"%d"}h`,
  d: giveContext("day").t`${1}d`,
  dd: giveContext("day").t`${"%d"}d`,
  M: giveContext("month").t`${1}mo`,
  MM: giveContext("month").t`${"%d"}mo`,
  y: giveContext("year").t`${1}yr`,
  yy: giveContext("year").t`${"%d"}yr`,
  // Display any number of seconds as "1min"
  s: () => giveContext("second").t`${1}min`,
  ss: () => giveContext("second").t`${1}min`,
  // Don't use "ago"
  past: "%s",
  // For the edge case where a model's last-edit date is somehow in the future
  future: c("{0} is a period of time such as '5 minutes' or '5 months'")
    .t`${"%s"} from now`,
};

dayjs.updateLocale(dayjs.locale(), { relativeTime: timeFormattingRules });

const getTimePassedSince = (timestamp: string) => {
  const date = dayjs(timestamp);
  if (timestamp && date.isValid()) {
    const locale = dayjs.locale();
    const cachedRules = dayjs.Ls[locale].relativeTime;
    dayjs.updateLocale(locale, { relativeTime: timeFormattingRules });
    const timePassed = date.fromNow();
    dayjs.updateLocale(locale, { relativeTime: cachedRules });
    return timePassed;
  } else {
    return t`(invalid date)`;
  }
};

export const LastEdited = ({
  editorFullName,
  timestamp,
}: {
  editorFullName: string | null;
  timestamp: string;
}) => {
  const timePassed = getTimePassedSince(timestamp);
  const timeLabel = timestamp ? timePassed : "";
  const formattedDate = formatDateTimeWithUnit(timestamp, "day", {});
  const time = (
    <time key="time" dateTime={timestamp}>
      {formattedDate}
    </time>
  );

  const tooltipLabel = c(
    "{0} is the full name (or if this is unavailable, the email address) of the last person who edited a model. {1} is a date",
  ).jt`Last edited by ${editorFullName}${(<br key="br" />)}${time}`;

  return (
    <Tooltip label={tooltipLabel} withArrow disabled={!timeLabel}>
      <Text role="note" size="small">
        {editorFullName}
        {editorFullName && timePassed && (
          <Text span px=".33rem" color="text-light">
            •
          </Text>
        )}
        {timePassed}
      </Text>
    </Tooltip>
  );
};
