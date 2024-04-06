import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import updateLocale from "dayjs/plugin/updateLocale";
import { c, t } from "ttag";
import _ from "underscore";

import { formatDateTimeWithUnit } from "metabase/lib/formatting";
import { Text, Tooltip } from "metabase/ui";

dayjs.extend(updateLocale);
dayjs.extend(relativeTime);

const timeFormattingRules: Record<string, unknown> = {
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
  // Display any number of seconds as "1min"
  s: () => t`${1}min`,
  ss: () => t`${1}min`,
  // Don't use "ago"
  past: "%s",
  // For the edge case where a model's last-edit date is somehow in the future
  future: t`${"%s"} from now`,
};

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
    <Tooltip label={tooltipLabel} disabled={!timeLabel}>
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
