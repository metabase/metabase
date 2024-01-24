import _ from "underscore";
import { c, t } from "ttag";
import dayjs from "dayjs";
import updateLocale from "dayjs/plugin/updateLocale";
import relativeTime from "dayjs/plugin/relativeTime";
import { Text, Tooltip } from "metabase/ui";

import { formatDateTimeWithUnit } from "metabase/lib/formatting";

dayjs.extend(updateLocale);
dayjs.extend(relativeTime);

// TODO: Move localization to separate PR
const giveContext = (unit: string) =>
  c(
    `Abbreviation for "{0} ${unit}(s)". Keep abbreviations distinct from one another.`,
  );

let relativeTimeConfig: Record<string, unknown> = {
  // The following line means: Take the translation of the string "{0}min".
  // Substitute "%d" for the number. Tell dayjs to use that string when
  // describing recent dates. For example, in English, the string would
  // be "%ds". So, if theDate is a Dayjs date that is 5 minutes in the
  // past, theDate.fromNow will return "5min".
  // In Swahili, "5min" is "5 dk". "{0}min" translates to "{0} dk".
  // So "%s dk" will be the string provided to Dayjs.fromNow for
  // describing dates that are mere minutes in the past.
  // Given a date 30 minutes in the past, it will return "30 dk".
  m: giveContext("minute").t`${"%d"}min`,
  h: giveContext("hour").t`${"%d"}h`,
  d: giveContext("day").t`${"%d"}d`,
  M: giveContext("month").t`${"%d"}mo`,
  y: giveContext("year").t`${"%d"}yr`,
  // For any number of seconds, just show 1min
  s: () => giveContext("minute").t`${1}min`,
  // Don't use "ago"
  past: "%s",
  // For the edge case where a model's last-edit date is somehow in the future
  future: c("{0} is a period of time such as '5 minutes' or '5 months'")
    .t`${"%s"} from now`,
};

// Use the same abbreviations for singular and plural
relativeTimeConfig = {
  ...relativeTimeConfig,
  mm: relativeTimeConfig.m,
  hh: relativeTimeConfig.h,
  dd: relativeTimeConfig.d,
  MM: relativeTimeConfig.M,
  yy: relativeTimeConfig.y,
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
  const timeLabel = timestamp ? getHowLongAgo(timestamp) : "";
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
