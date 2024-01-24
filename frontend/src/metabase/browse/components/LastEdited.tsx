import _ from "underscore";
import { c, t } from "ttag";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { Text, Tooltip } from "metabase/ui";

import { formatDateTimeWithUnit } from "metabase/lib/formatting";

dayjs.extend(relativeTime);

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
