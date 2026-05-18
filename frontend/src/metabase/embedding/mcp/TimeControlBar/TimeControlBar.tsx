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

export function TimeControlBar({
  timeRange,
  timeGranularity,
}: TimeControlBarProps) {
  const hasTimeControl = timeRange || timeGranularity;

  return (
    <Flex
      w="100%"
      direction={{ base: "column", xs: "row" }}
      align={{ base: "flex-start", xs: "center" }}
      justify="center"
      gap={{ base: "sm", xs: "xs" }}
      data-testid="query-explorer-bar"
    >
      {hasTimeControl && (
        <Flex
          h={32}
          align="stretch"
          bd="1px solid var(--mb-color-border)"
          bdrs="md"
          style={{ overflow: "hidden" }}
        >
          {timeRange && <TimeRangeControl timeRange={timeRange} />}

          {timeRange && timeGranularity && <Divider orientation="vertical" />}

          {timeGranularity && (
            <TimeGranularityControl timeGranularity={timeGranularity} />
          )}
        </Flex>
      )}
    </Flex>
  );
}
