import _ from "underscore";
import { c, t } from "ttag";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import updateLocale from "dayjs/plugin/updateLocale";

import { Text, Tooltip } from "metabase/ui";
import { formatDateTimeWithUnit } from "metabase/lib/formatting";

dayjs.extend(updateLocale);
dayjs.extend(relativeTime);

const relativeTimeConfig: Record<string, unknown> = {
  m: t`${1}min`,
  mm: t`${"%d"}min`,
  h: t`${1}h`,
  hh: t`${"%d"}h`,
  d: t`${1}d`,
  dd: t`${"%d"}d`,
  M: t`${1}mo`,
  MM: t`${"%d"}mo`,
  y: t`${1}yr`,
  yy: t`${"%d"}yr`,
  // For any number of seconds, just show 1min
  s: () => t`${1}min`,
  ss: () => t`${1}min`,
  // Don't use "ago"
  past: "%s",
  // For the edge case where the system time is prior to a model's last-edit date
  future: t`${"%s"} from now`,
};

dayjs.updateLocale(dayjs.locale(), { relativeTime: relativeTimeConfig });

const getHowLongAgo = (timestamp: string) => {
  const date = dayjs(timestamp);
  if (timestamp && date.isValid()) {
    return date.fromNow();
  } else {
    return t`(invalid date)`;
  }
};

export const LastEdited = ({
  fullName,
  firstName,
  lastName,
  timestamp,
}: {
  fullName: string | null;
  firstName?: string | null;
  lastName?: string | null;
  timestamp: string;
}) => {
  const howLongAgo = getHowLongAgo(timestamp);
  const timeLabel = timestamp ? howLongAgo : "";
  const formattedDate = formatDateTimeWithUnit(timestamp, "day", {});
  const name = firstName && lastName ? `${firstName} ${lastName[0]}` : fullName;
  const time = (
    <time key="time" dateTime={timestamp}>
      {formattedDate}
    </time>
  );

  const tooltipLabel = c(
    "{0} is the full name (or if this is unavailable, the email address) of the last person who edited a model. {1} is a date",
  ).jt`Last edited by ${fullName}${(<br key="br" />)}${time}`;
  return (
    <Tooltip label={tooltipLabel} withArrow disabled={!timeLabel}>
      <Text role="note" size="small">
        {name}
        {name && howLongAgo && (
          <Text span px=".33rem">
            •
          </Text>
        )}
        {howLongAgo}
      </Text>
    </Tooltip>
  );
};
