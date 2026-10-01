import { useInterval } from "react-use";

import { getFormattedTime } from "metabase/common/components/DateTime/DateTime";
import { Text, Tooltip } from "metabase/ui";
import { useForceUpdate } from "metabase/utils/use-force-update";

import { getCompactRelativeTime } from "./utils";

const LAST_ACTIVITY_REFRESH_INTERVAL = 60_000;

export function ExplorationLastActivity({
  lastActivityAt,
}: {
  lastActivityAt: string;
}) {
  const forceUpdate = useForceUpdate();
  useInterval(forceUpdate, LAST_ACTIVITY_REFRESH_INTERVAL);

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
