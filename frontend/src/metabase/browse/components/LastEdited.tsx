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
const relativeTimeConfig = {
  m: giveContext("minute").t`${"%d"}min`,
  mm: giveContext("minute").t`${"%d"}min`,
  h: giveContext("hour").t`${"%d"}h`,
  hh: giveContext("hour").t`${"%d"}h`,
  d: giveContext("day").t`${"%d"}d`,
  dd: giveContext("day").t`${"%d"}d`,
  w: giveContext("week").t`${"%d"}d`,
  ww: giveContext("week").t`${"%d"}d`,
  M: giveContext("month").t`${"%d"}mo`,
  MM: giveContext("month").t`${"%d"}mo`,
  y: giveContext("year").t`${"%d"}yr`,
  yy: giveContext("year").t`${"%d"}yr`,
  s: () => giveContext("minute").t`${1}min`,
  ss: () => giveContext("minute").t`${1}min`,
  past: "%s",
  future: giveContext("period").t`${"%s"} from now`,
};

dayjs.updateLocale(dayjs.locale(), { relativeTime: relativeTimeConfig });

// TODO: Check if this is required:
// // Use a different dayjs instance to avoid polluting the global one
// const dayjsWithAbbrevs = dayjs.extend((_, { instance }) => {
//   return {
//     updateLocale(localeName, config) {
//       const locale = (instance.Ls[localeName] = {
//         ...instance.Ls[localeName],
//         ...config,
//       });
//       return locale;
//     },
//   };
// });

const getHowLongAgo = (timestamp: string) => {
  const date = dayjs(timestamp);
  if (timestamp && date.isValid()) {
    return date.fromNow();
  } else {
    return t`(invalid date)`;
  }
};

export const LastEdited = ({
  lastEditorFullName,
  timestamp,
}: {
  lastEditorFullName: string | null;
  timestamp: string;
}) => {
  const howLongAgo = getHowLongAgo(timestamp);
  const timeLabel = timestamp ? howLongAgo : "";
  const formattedDate = formatDateTimeWithUnit(timestamp, "day", {});
  const time = (
    <time key="time" dateTime={timestamp}>
      {formattedDate}
    </time>
  );
  const tooltipLabel = c(
    "{0} is the full name (or if this is unavailable, the email address) of the last person who edited a model. {1} is a phrase like '5 months ago'",
  ).jt`Last edited by ${lastEditorFullName}${(<br key="br" />)}${time}`;
  return (
    <Tooltip label={tooltipLabel} withArrow disabled={!timeLabel}>
      <Text role="note" size="small">
        {lastEditorFullName}
        {lastEditorFullName && howLongAgo && (
          <Text span px=".33rem">
            •
          </Text>
        )}
        {howLongAgo}
      </Text>
    </Tooltip>
  );
};
