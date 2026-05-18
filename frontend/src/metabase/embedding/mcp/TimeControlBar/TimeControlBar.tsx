import { Divider, Flex } from "metabase/ui";

import { TimeGranularityControl } from "./TimeGranularityControl";
import { TimeRangeControl } from "./TimeRangeControl";
import type { TimeControlBarProps } from "./types";

export type {
  TimeControlBarProps,
  TimeGranularityConfig,
  TimeGranularityItem,
  TimeRangeConfig,
} from "./types";

export const TimeControlBar = ({
  timeRange,
  timeGranularity,
}: TimeControlBarProps) =>
  (timeRange || timeGranularity) && (
    <Flex
      h={32}
      align="stretch"
      bd="1px solid var(--mb-color-border)"
      bdrs="md"
      style={{ overflow: "hidden" }}
      data-testid="query-explorer-bar"
    >
      {timeRange && <TimeRangeControl timeRange={timeRange} />}

      {timeRange && timeGranularity && <Divider orientation="vertical" />}

      {timeGranularity && (
        <TimeGranularityControl timeGranularity={timeGranularity} />
      )}
    </Flex>
  );
