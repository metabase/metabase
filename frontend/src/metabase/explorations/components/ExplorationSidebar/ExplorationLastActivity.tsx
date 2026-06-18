import { useEffect, useState } from "react";

import { getFormattedTime } from "metabase/common/components/DateTime/DateTime";
import { Text, Tooltip } from "metabase/ui";

import { getCompactRelativeTime } from "./utils";

const LAST_ACTIVITY_REFRESH_INTERVAL = 60_000;

export function ExplorationLastActivity({
  lastActivityAt,
}: {
  lastActivityAt: string;
}) {
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const intervalId = setInterval(
      () => forceUpdate((tick) => tick + 1),
      LAST_ACTIVITY_REFRESH_INTERVAL,
    );
    return () => clearInterval(intervalId);
  }, []);

  return (
    <Tooltip label={getFormattedTime(lastActivityAt)}>
      <Text
        size="md"
        c="text-secondary"
        lh="1rem"
        flex="none"
        fw={500}
        ta="right"
      >
        {getCompactRelativeTime(lastActivityAt)}
      </Text>
    </Tooltip>
  );
}
